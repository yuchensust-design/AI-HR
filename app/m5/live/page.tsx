"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  M5_STORAGE_KEYS,
  SESSIONS_MAX,
  type InterviewQuestion,
  type InterviewSession,
  type InterviewSessionConfig,
  type TurnAnswer,
  type TurnEvaluation,
} from "@/lib/interview-types";
import { PERSONA_SPECS } from "@/lib/interviewer-personas";
import { useASR } from "@/lib/use-asr";
import { useMediaStream } from "@/lib/use-media-stream";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";

/**
 * 模块 5 · 模拟面试 进行中
 *
 * 状态机:
 *   loading → asking [TTS 播] → listening [ASR 转] → thinking
 *   thinking → asking (currentIdx++; idx===N → finished)
 *   any → paused → 前态
 *   any → finished → 写 localStorage interview_sessions (最近 2 场 FIFO) → router.push("/m5/debrief")
 *
 * 关键交互:
 *   - 静默 60s 温和提示(plan §F.3)
 *   - 跳过 2 选 1(plan §F.4)
 *   - 暂停无限期(plan §F.13)
 *   - "💡 查看回答思路" 任意时刻可点(plan §F.14)
 *   - 摄像头 vs 录制独立(Q2)
 */

type Status =
  | "loading"
  | "asking"
  | "listening"
  | "thinking"
  | "paused"
  | "finished"
  | "error";

type State = {
  status: Status;
  prevStatus: Status | null;
  questions: InterviewQuestion[];
  sessionId: string;
  currentIdx: number;
  answers: TurnAnswer[];
  turnEvaluations: TurnEvaluation[];
  currentTranscript: string;
  interimTranscript: string;
  silenceShownForIdx: number | null;
  showSkipModal: boolean;
  showTipsCard: boolean;
  tipsContent: string | null;
  tipsLoading: boolean;
  panelTab: "thinking" | "transcript";
  errorMsg: string | null;
};

type Action =
  | { type: "QUESTIONS_LOADED"; questions: InterviewQuestion[]; sessionId: string }
  | { type: "TTS_END" }
  | { type: "ASR_INTERIM"; text: string }
  | { type: "ASR_FINAL"; text: string }
  | { type: "USER_ANSWER_DONE" }
  | { type: "TURN_EVAL"; ev: TurnEvaluation }
  | { type: "SKIP"; kind: "dont_know" | "know_but_skip" }
  | { type: "OPEN_SKIP" }
  | { type: "CLOSE_SKIP" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "FINISH" }
  | { type: "SILENCE_SHOW"; idx: number }
  | { type: "PANEL_TAB"; tab: "thinking" | "transcript" }
  | { type: "TIPS_OPEN" }
  | { type: "TIPS_LOAD"; content: string }
  | { type: "TIPS_CLOSE" }
  | { type: "ERROR"; msg: string };

const initial: State = {
  status: "loading",
  prevStatus: null,
  questions: [],
  sessionId: "",
  currentIdx: 0,
  answers: [],
  turnEvaluations: [],
  currentTranscript: "",
  interimTranscript: "",
  silenceShownForIdx: null,
  showSkipModal: false,
  showTipsCard: false,
  tipsContent: null,
  tipsLoading: false,
  panelTab: "thinking",
  errorMsg: null,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "QUESTIONS_LOADED":
      return {
        ...s,
        status: "asking",
        questions: a.questions,
        sessionId: a.sessionId,
      };
    case "TTS_END":
      if (s.status !== "asking") return s;
      return { ...s, status: "listening", interimTranscript: "" };
    case "ASR_INTERIM":
      return { ...s, interimTranscript: a.text };
    case "ASR_FINAL":
      return {
        ...s,
        currentTranscript: (s.currentTranscript + " " + a.text).trim(),
        interimTranscript: "",
      };
    case "USER_ANSWER_DONE": {
      const finalText = (s.currentTranscript + " " + s.interimTranscript).trim();
      const q = s.questions[s.currentIdx];
      if (!q) return s;
      const answer: TurnAnswer = {
        question_id: q.id,
        transcript: finalText,
        filler_word_count: countFillers(finalText),
        answered_at: new Date().toISOString(),
      };
      const nextAnswers = [...s.answers, answer];
      const nextIdx = s.currentIdx + 1;
      if (nextIdx >= s.questions.length) {
        return {
          ...s,
          answers: nextAnswers,
          status: "finished",
          currentTranscript: "",
          interimTranscript: "",
        };
      }
      return {
        ...s,
        answers: nextAnswers,
        currentIdx: nextIdx,
        status: "asking",
        currentTranscript: "",
        interimTranscript: "",
        silenceShownForIdx: null,
      };
    }
    case "TURN_EVAL":
      return { ...s, turnEvaluations: [...s.turnEvaluations, a.ev] };
    case "OPEN_SKIP":
      return { ...s, showSkipModal: true };
    case "CLOSE_SKIP":
      return { ...s, showSkipModal: false };
    case "SKIP": {
      const q = s.questions[s.currentIdx];
      if (!q) return { ...s, showSkipModal: false };
      const answer: TurnAnswer = {
        question_id: q.id,
        transcript: "",
        skipped: a.kind,
        answered_at: new Date().toISOString(),
      };
      const nextAnswers = [...s.answers, answer];
      const nextIdx = s.currentIdx + 1;
      const reachedEnd = nextIdx >= s.questions.length;
      return {
        ...s,
        answers: nextAnswers,
        currentIdx: reachedEnd ? s.currentIdx : nextIdx,
        status: reachedEnd ? "finished" : "asking",
        currentTranscript: "",
        interimTranscript: "",
        silenceShownForIdx: null,
        showSkipModal: false,
      };
    }
    case "PAUSE":
      if (s.status === "paused" || s.status === "finished") return s;
      return { ...s, prevStatus: s.status, status: "paused" };
    case "RESUME":
      if (s.status !== "paused") return s;
      return { ...s, status: s.prevStatus ?? "asking", prevStatus: null };
    case "FINISH":
      return {
        ...s,
        status: "finished",
        currentTranscript: "",
        interimTranscript: "",
      };
    case "SILENCE_SHOW":
      return { ...s, silenceShownForIdx: a.idx };
    case "PANEL_TAB":
      return { ...s, panelTab: a.tab };
    case "TIPS_OPEN":
      return { ...s, showTipsCard: true, tipsLoading: true, tipsContent: null };
    case "TIPS_LOAD":
      return { ...s, tipsLoading: false, tipsContent: a.content };
    case "TIPS_CLOSE":
      return {
        ...s,
        showTipsCard: false,
        tipsContent: null,
        tipsLoading: false,
      };
    case "ERROR":
      return { ...s, status: "error", errorMsg: a.msg };
    default:
      return s;
  }
}

const FILLER_RE = /嗯|呃|那个|这样|就是|然后|嗯嗯|啊/g;
function countFillers(text: string): number {
  return (text.match(FILLER_RE) ?? []).length;
}

const PERSONA_LABEL: Record<string, string> = {
  gentle: "🌸 亲切姐姐",
  strict: "⚡ 严厉压力",
  rigor: "🔍 严谨技术",
};
const TYPE_LABEL: Record<string, string> = {
  semi: "半结构化",
  bq: "行为面 BQ",
  tech: "技术面",
};

type InputMode = "voice" | "text";

export default function Module5LivePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm-bg pt-32 text-center text-ink-muted">加载中…</div>}>
      <Module5LiveContent />
    </Suspense>
  );
}

function Module5LiveContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const convId = sp.get("c");
  const { user } = useUser();
  const convQs = convId ? `?c=${convId}` : "";
  const [state, dispatch] = useReducer(reducer, initial);
  const [config, setConfig] = useState<InterviewSessionConfig | null>(null);
  const [recordDownloadUrl, setRecordDownloadUrl] = useState<string | null>(
    null
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  const [silenceMs, setSilenceMs] = useState(0);
  const [recordingActive, setRecordingActive] = useState(false);
  /**
   * 答题输入模式 toggle:voice = 语音(默认)/ text = 文字。
   * TTS 失败或浏览器 ASR 不可用都会自动切 text;用户也可以主动切。
   */
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  /** 当前题的文字答题草稿(text 模式独立维护,提交时合并到 currentTranscript) */
  const [textDraft, setTextDraft] = useState("");
  /** TTS 失败标志:显示顶部 banner 并自动切文字模式 */
  const [ttsFailed, setTtsFailed] = useState(false);

  // 加载 config:登录 + 有 convId → DB;否则 localStorage
  useEffect(() => {
    if (user && convId) {
      let cancelled = false;
      const supabase = createClient();
      supabase
        .from("m5_interviews")
        .select("config_json")
        .eq("conversation_id", convId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          const cfg = data?.config_json as InterviewSessionConfig | undefined;
          if (!cfg || !cfg.jd_text) {
            dispatch({ type: "ERROR", msg: "该会话还没填配置 — 请回 /m5 配置" });
            return;
          }
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setConfig(cfg);
        });
      return () => {
        cancelled = true;
      };
    }
    // 游客或登录无 convId → localStorage fallback
    try {
      const raw = window.localStorage.getItem(M5_STORAGE_KEYS.SESSION_CONFIG);
      if (!raw) {
        dispatch({
          type: "ERROR",
          msg: "没有面试配置 — 请回 /m5 重新填写",
        });
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfig(JSON.parse(raw) as InterviewSessionConfig);
    } catch (err) {
      console.error("[m5/live] config load failed", err);
      dispatch({
        type: "ERROR",
        msg: "读取面试配置失败",
      });
    }
  }, []);

  // 用 config 调 prep-questions
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m5/prep-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume_text: config.resume_text,
            jd_text: config.jd_text,
            type: config.type,
            persona: config.persona,
            num_questions: config.num_questions,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const j = (await res.json()) as {
          questions: InterviewQuestion[];
          session_id: string;
        };
        if (cancelled) return;
        if (!j.questions || j.questions.length === 0) {
          throw new Error("题库为空");
        }
        dispatch({
          type: "QUESTIONS_LOADED",
          questions: j.questions,
          sessionId: j.session_id,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        dispatch({ type: "ERROR", msg: `题库生成失败:${msg}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  // 媒体流(摄像头 + 麦克风)
  const wantVideo = config?.mode === "camera";
  const mediaEnabled = state.status !== "loading" && state.status !== "error";
  const { stream, permission, error: mediaError } = useMediaStream({
    wantVideo: !!wantVideo,
    enabled: mediaEnabled,
  });
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (cameraVideoRef.current && stream) {
      cameraVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  // 录制(只在 config.record + 拿到 stream + 有 video tracks 时启)
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  useEffect(() => {
    if (!config?.record || !stream) return;
    if (stream.getVideoTracks().length === 0) return;
    let mimeType: string | undefined;
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const c of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(c)
      ) {
        mimeType = c;
        break;
      }
    }
    try {
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = rec;
      recordedChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };
      rec.onstart = () => setRecordingActive(true);
      rec.onstop = () => setRecordingActive(false);
      rec.start(1000);
    } catch (err) {
      console.warn("[m5/live] recorder failed", err);
    }
    return () => {
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      setRecordingActive(false);
      recorderRef.current = null;
    };
  }, [config?.record, stream]);

  // ASR
  const asr = useASR({
    onInterim: (t) => dispatch({ type: "ASR_INTERIM", text: t }),
    onFinal: (t) => dispatch({ type: "ASR_FINAL", text: t }),
    onError: (msg) => console.warn("[m5/live] asr err", msg),
  });
  const asrStartedForIdx = useRef<number | null>(null);
  useEffect(() => {
    // 文字模式下完全不启 ASR,避免麦克风抢占 / 浏览器报错
    if (inputMode === "text") {
      if (asr.running) asr.stop();
      return;
    }
    if (state.status === "listening") {
      if (
        stream &&
        asrStartedForIdx.current !== state.currentIdx &&
        !asr.running
      ) {
        asrStartedForIdx.current = state.currentIdx;
        asr.start(stream);
      }
    } else if (state.status === "asking" || state.status === "thinking") {
      if (asr.running) asr.stop();
    } else if (state.status === "paused" || state.status === "finished") {
      if (asr.running) asr.stop();
    }
  }, [state.status, state.currentIdx, stream, asr, inputMode]);

  // ASR 卡 init 兜底(plan offer-1-sparkling-hippo P1)
  // listening 进入 6s 内如果 asr.mode 仍为 null(没建立任何 ASR 通道),提示用户可一键切文字模式
  const [asrStuckOnInit, setAsrStuckOnInit] = useState(false);
  useEffect(() => {
    if (inputMode !== "voice") {
      setAsrStuckOnInit(false);
      return;
    }
    if (state.status !== "listening") {
      setAsrStuckOnInit(false);
      return;
    }
    // 已经听到声音,不再提示
    if (state.currentTranscript || state.interimTranscript) {
      setAsrStuckOnInit(false);
      return;
    }
    const t = window.setTimeout(() => {
      // 仍然没听到,且 ASR mode 没 ready
      if (!state.currentTranscript && !state.interimTranscript && (!asr.mode || asr.mode === "text_input")) {
        setAsrStuckOnInit(true);
      }
    }, 6000);
    return () => window.clearTimeout(t);
  }, [
    state.status,
    state.currentIdx,
    state.currentTranscript,
    state.interimTranscript,
    asr.mode,
    inputMode,
  ]);

  // TTS:status === asking 时合成 + 播
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsPlayedForIdx = useRef<number | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const currentQuestion = state.questions[state.currentIdx];
  useEffect(() => {
    if (state.status !== "asking" || !currentQuestion || !config) return;
    if (ttsPlayedForIdx.current === state.currentIdx) return;
    ttsPlayedForIdx.current = state.currentIdx;
    let cancelled = false;
    (async () => {
      setTtsLoading(true);
      try {
        const res = await fetch("/api/m5/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: currentQuestion.text,
            persona: config.persona,
          }),
        });
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const j = (await res.json()) as { audio_base64: string };
        if (cancelled) return;
        if (audioRef.current) {
          audioRef.current.src = j.audio_base64;
          audioRef.current.onended = () => dispatch({ type: "TTS_END" });
          await audioRef.current.play().catch(() => {
            dispatch({ type: "TTS_END" });
          });
        } else {
          dispatch({ type: "TTS_END" });
        }
      } catch (err) {
        console.warn("[m5/live] tts failed, fallback to text mode", err);
        // TTS 失败 → 显性 banner + 自动切文字模式,让用户清楚知道语音不可用但流程不中断
        if (!cancelled) {
          setTtsFailed(true);
          setInputMode("text");
        }
        dispatch({ type: "TTS_END" });
      } finally {
        if (!cancelled) setTtsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, state.currentIdx, currentQuestion, config]);

  // evaluate-turn fire-and-forget(当 answer 被 push 后)
  useEffect(() => {
    if (state.answers.length === 0) return;
    const lastAns = state.answers[state.answers.length - 1];
    if (!lastAns) return;
    const alreadyEvaluated = state.turnEvaluations.some(
      (e) => e.question_id === lastAns.question_id
    );
    if (alreadyEvaluated) return;
    const q = state.questions.find((x) => x.id === lastAns.question_id);
    if (!q) return;
    fetch("/api/m5/evaluate-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, answer: lastAns }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { evaluation?: TurnEvaluation } | null) => {
        if (j?.evaluation) {
          dispatch({ type: "TURN_EVAL", ev: j.evaluation });
        }
      })
      .catch((err) =>
        console.warn("[m5/live] evaluate-turn failed (silent)", err)
      );
  }, [state.answers, state.questions, state.turnEvaluations]);

  // 切到下一题时清空文字草稿
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextDraft("");
  }, [state.currentIdx]);

  // 切到文字模式时,自动把左侧 panel 切到 transcript tab 让 textarea 可见
  useEffect(() => {
    if (inputMode === "text" && state.panelTab !== "transcript") {
      dispatch({ type: "PANEL_TAB", tab: "transcript" });
    }
  }, [inputMode, state.panelTab]);

  /** 文字模式:点提交 → 把 textDraft 合并到 transcript → 走 USER_ANSWER_DONE */
  const handleTextSubmit = useCallback(() => {
    const trimmed = textDraft.trim();
    if (!trimmed) return;
    dispatch({ type: "ASR_FINAL", text: trimmed });
    setTextDraft("");
    // ASR_FINAL 通过 reducer 把 text 拼进 currentTranscript;下面 USER_ANSWER_DONE 才会把它结算
    dispatch({ type: "USER_ANSWER_DONE" });
  }, [textDraft]);

  // 全场计时
  useEffect(() => {
    if (state.status === "loading" || state.status === "finished") return;
    if (state.status === "paused") return;
    const t = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [state.status]);

  // 静默计时(plan §F.3 60s 提示)
  useEffect(() => {
    if (state.status !== "listening") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSilenceMs(0);
      return;
    }
    setSilenceMs(0);
    const last = Date.now();
    const t = window.setInterval(() => {
      const elapsed = Date.now() - last;
      setSilenceMs(elapsed);
      if (
        elapsed > 60000 &&
        state.silenceShownForIdx !== state.currentIdx
      ) {
        dispatch({ type: "SILENCE_SHOW", idx: state.currentIdx });
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [state.status, state.currentIdx, state.silenceShownForIdx]);

  // session 完成 → 写 localStorage + 录制下载 + 跳 debrief
  useEffect(() => {
    if (state.status !== "finished" || !config) return;
    // 停录制 + 产 download URL
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = () => {
        setRecordingActive(false);
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, {
            type: "video/webm",
          });
          const url = URL.createObjectURL(blob);
          setRecordDownloadUrl(url);
        }
      };
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    // 写 sessions(最近 2 场 FIFO)
    const newSession: InterviewSession = {
      id: state.sessionId,
      config,
      questions: state.questions,
      answers: state.answers,
      turn_evaluations: state.turnEvaluations,
    };
    try {
      const existRaw = window.localStorage.getItem(M5_STORAGE_KEYS.SESSIONS);
      const exist = existRaw
        ? (JSON.parse(existRaw) as InterviewSession[])
        : [];
      const next = [...exist, newSession].slice(-SESSIONS_MAX);
      window.localStorage.setItem(
        M5_STORAGE_KEYS.SESSIONS,
        JSON.stringify(next)
      );
    } catch (err) {
      console.error("[m5/live] save session failed", err);
    }
    // 登录 + 有 convId → 写 m5_interviews.turns_json
    if (user && convId) {
      createClient()
        .from("m5_interviews")
        .update({
          turns_json: {
            questions: state.questions,
            answers: state.answers,
            turn_evaluations: state.turnEvaluations,
          },
        })
        .eq("conversation_id", convId)
        .then(({ error }) => {
          if (error) console.error("[m5/live] DB save failed:", error);
        });
    }
  }, [state.status, state.sessionId, state.questions, state.answers, state.turnEvaluations, config, user, convId]);

  // "💡 查看回答思路" - 复用 /api/chat
  const handleTipsOpen = useCallback(async () => {
    if (!currentQuestion) return;
    dispatch({ type: "TIPS_OPEN" });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "你给学生答面试题做提示。给 3-5 条简短提示(每条 ≤ 25 字),从 STAR / 数字 / own 决策 / 反思 4 个维度,用 → 开头。不直接给答案。",
            },
            {
              role: "user",
              content: `面试题:${currentQuestion.text}\n考察点:${currentQuestion.intent}\n请给我答题提示(→开头,中文,3-5 条)。`,
            },
          ],
        }),
      });
      const data = await res.text();
      let content = data;
      try {
        const parsed = JSON.parse(data) as {
          content?: string;
          message?: string;
          reply?: string;
        };
        content =
          parsed.content ?? parsed.message ?? parsed.reply ?? data;
      } catch {
        // 流式返回直接 text
      }
      dispatch({ type: "TIPS_LOAD", content });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "提示加载失败";
      dispatch({ type: "TIPS_LOAD", content: `❌ ${msg}` });
    }
  }, [currentQuestion]);

  const goDebrief = useCallback(() => {
    router.push(`/m5/debrief${convQs}`);
  }, [router, convQs]);

  const personaLabel = config ? PERSONA_LABEL[config.persona] : "";
  const typeLabel = config ? TYPE_LABEL[config.type] : "";
  const personaTagline = config
    ? PERSONA_SPECS[config.persona].short_tagline
    : "";
  const showSilenceTip =
    state.status === "listening" &&
    state.silenceShownForIdx === state.currentIdx &&
    silenceMs > 60000;
  const canSubmitText =
    state.status === "listening" && textDraft.trim().length > 0;

  const formattedElapsed = useMemo(() => {
    const m = Math.floor(elapsedSec / 60)
      .toString()
      .padStart(2, "0");
    const s = (elapsedSec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [elapsedSec]);

  if (state.status === "loading" || !config) {
    return (
      <main className="h-screen bg-warm-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-3">🌸</div>
          <p className="text-ink-soft text-sm font-display italic mb-1">
            Preparing your interview
          </p>
          <p className="text-ink text-base">让我看看你的简历…</p>
          {state.errorMsg && (
            <p className="text-esther-red text-sm mt-4 max-w-[400px]">
              {state.errorMsg}{" "}
              <Link href="/m5" className="underline">
                回 /m5
              </Link>
            </p>
          )}
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="h-screen bg-warm-bg flex items-center justify-center">
        <div className="text-center max-w-[420px] px-6">
          <p className="text-esther-red font-medium mb-2">出错了</p>
          <p className="text-ink-soft text-sm mb-4">{state.errorMsg}</p>
          <Link
            href="/m5"
            className="inline-block rounded-full bg-esther-blue text-white px-6 py-2 text-sm"
          >
            回 /m5 重新开始
          </Link>
        </div>
      </main>
    );
  }

  if (state.status === "finished") {
    return (
      <main className="h-screen bg-warm-bg flex items-center justify-center">
        <div className="text-center max-w-[480px] px-6">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-ink text-xl font-bold mb-2">面试结束</p>
          <p className="text-ink-soft text-sm mb-6">
            正在准备复盘报告…
          </p>
          {recordDownloadUrl && (
            <a
              href={recordDownloadUrl}
              download={`mock-interview-${state.sessionId}.webm`}
              className="inline-block rounded-full border border-border bg-card text-ink-soft px-5 py-2 text-sm hover:border-esther-blue transition-colors mb-3"
            >
              📥 下载本场录像(.webm)
            </a>
          )}
          <div>
            <button
              type="button"
              onClick={goDebrief}
              className="inline-block rounded-full bg-esther-blue text-white px-6 py-2 text-sm font-medium hover:bg-esther-blue-dark"
            >
              看 4 维复盘 →
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isCameraMode = config.mode === "camera" && permission !== "denied";
  const recording = config.record && recordingActive;

  return (
    <main className="h-screen bg-warm-bg-deep flex flex-col">
      <audio ref={audioRef} hidden />

      {/* 顶部 header */}
      <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href="/m5"
            className="text-sm text-ink-soft hover:text-esther-blue transition-colors"
          >
            ← 退出面试
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-red/15 text-esther-red text-[11px] font-bold">
              {state.status === "paused" ? "⏸ 暂停" : "● LIVE"}
            </span>
            <span className="text-sm text-ink-soft">
              {typeLabel} · {personaLabel}
            </span>
            {personaTagline && (
              <span className="text-[11px] text-ink-muted italic hidden md:inline">
                · {personaTagline}
              </span>
            )}
            {recording && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-esther-red/15 text-esther-red text-[10px] font-bold">
                <span className="w-2 h-2 rounded-full bg-esther-red animate-pulse" />
                REC
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* 答题模式 toggle:不再藏在 ASR 失败兜底里 */}
          <div className="inline-flex rounded-full border border-border bg-warm-bg-deep p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setInputMode("voice")}
              className={`px-3 py-1 rounded-full transition-colors ${
                inputMode === "voice"
                  ? "bg-esther-blue text-white"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              🎙️ 语音
            </button>
            <button
              type="button"
              onClick={() => setInputMode("text")}
              className={`px-3 py-1 rounded-full transition-colors ${
                inputMode === "text"
                  ? "bg-esther-blue text-white"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              ⌨️ 文字
            </button>
          </div>
          <p className="text-sm text-ink">
            <span className="font-bold text-esther-blue">
              {state.currentIdx + 1}
            </span>
            <span className="text-ink-muted"> / {state.questions.length}</span>
          </p>
          <p className="text-sm text-ink font-mono">
            <span className="text-ink-muted">⏱</span> {formattedElapsed}
          </p>
        </div>
      </header>

      {ttsFailed && (
        <div className="bg-esther-yellow/30 border-b border-esther-yellow/50 px-6 py-2 flex items-center gap-3 text-xs text-ink flex-shrink-0">
          <span className="text-base">🔇</span>
          <p className="flex-1 leading-relaxed">
            <span className="font-medium">语音合成暂时不可用</span> — 已切换到文字模式,你可以照常用键盘答题继续这场面试
          </p>
          <button
            type="button"
            onClick={() => setTtsFailed(false)}
            className="text-ink-muted hover:text-ink text-sm"
            aria-label="关闭提示"
          >
            ✕
          </button>
        </div>
      )}

      {/* 主内容 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] overflow-hidden">
        {/* 左侧文字面板 */}
        <aside className="bg-card border-r border-border flex flex-col overflow-hidden">
          {/* Tab */}
          <div className="border-b border-border flex">
            <button
              type="button"
              onClick={() => dispatch({ type: "PANEL_TAB", tab: "thinking" })}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                state.panelTab === "thinking"
                  ? "text-esther-blue border-b-2 border-esther-blue bg-warm-bg-deep/30"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              答题思路
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: "PANEL_TAB", tab: "transcript" })
              }
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                state.panelTab === "transcript"
                  ? "text-esther-blue border-b-2 border-esther-blue bg-warm-bg-deep/30"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              实时转写
            </button>
          </div>

          {state.panelTab === "thinking" ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {currentQuestion && (
                <>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-ink-muted font-display italic mb-2">
                      Current question
                    </p>
                    <p className="text-sm text-ink leading-relaxed font-medium">
                      {currentQuestion.text}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-ink-muted font-display italic mb-2">
                      考察什么
                    </p>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {currentQuestion.intent}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTipsOpen}
                    disabled={state.tipsLoading}
                    className="border border-esther-yellow/60 bg-esther-yellow/15 rounded-xl p-4 text-left hover:bg-esther-yellow/25 transition-colors disabled:opacity-50 w-full"
                  >
                    <p className="text-xs font-semibold text-ink mb-2">
                      💡 查看回答思路
                    </p>
                    {state.tipsLoading ? (
                      <p className="text-[11px] text-ink-soft">提示加载中…</p>
                    ) : state.tipsContent ? (
                      <p className="text-[11px] text-ink leading-relaxed whitespace-pre-wrap">
                        {state.tipsContent}
                      </p>
                    ) : (
                      <p className="text-[11px] text-ink-soft">
                        点开看 STAR / 数字 / own 决策 / 反思 4 维提醒
                      </p>
                    )}
                    <p className="text-[10px] text-ink-muted mt-2 font-display italic">
                      * 可随时点,不影响评分
                    </p>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {currentQuestion && (
                <div className="text-xs text-ink-soft leading-relaxed">
                  <span className="font-medium text-esther-blue">
                    面试官:
                  </span>{" "}
                  {currentQuestion.text}
                </div>
              )}
              {(state.currentTranscript || state.interimTranscript) && (
                <div className="text-xs text-ink leading-relaxed">
                  <span className="font-medium text-esther-yellow-dark">
                    你:
                  </span>{" "}
                  {state.currentTranscript}
                  {state.interimTranscript && (
                    <span className="text-ink-muted italic">
                      {" "}
                      {state.interimTranscript}
                    </span>
                  )}
                </div>
              )}
              {inputMode === "text" && state.status === "listening" && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[11px] text-ink-muted font-display italic">
                    ⌨️ 文字答题 — 想到什么先打,提交后立即进入下一题评分
                  </p>
                  <textarea
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleTextSubmit();
                      }
                    }}
                    placeholder="把你的答案打在这里(⌘/Ctrl + Enter 直接提交)"
                    className="w-full min-h-[160px] p-3 rounded border border-border bg-warm-bg-deep text-sm focus:outline-none focus:border-esther-blue"
                  />
                  <button
                    type="button"
                    onClick={handleTextSubmit}
                    disabled={!canSubmitText}
                    className="w-full rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
                  >
                    ✓ 提交这题
                  </button>
                </div>
              )}
              {inputMode === "text" && state.status !== "listening" && (
                <p className="text-[11px] text-ink-muted italic pt-2 border-t border-border">
                  ⌨️ 文字模式已开启 — 等面试官说完就可以打字答题
                </p>
              )}
            </div>
          )}
        </aside>

        {/* 右侧视频/AI 头像区 */}
        <section className="relative bg-gradient-to-br from-warm-bg-deep to-warm-bg overflow-hidden flex items-center justify-center">
          {isCameraMode ? (
            <>
              {/* 用户摄像头大窗 */}
              <div className="absolute inset-6 rounded-2xl bg-ink/80 border border-border shadow-2xl overflow-hidden">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-esther-yellow mr-2" />
                  你
                </div>
                {permission === "audio_only" && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    摄像头被拒,已切纯语音
                  </div>
                )}
              </div>

              {/* AI 头像小窗(右下) */}
              <div className="absolute bottom-12 right-12 w-44 rounded-xl overflow-hidden shadow-xl border-2 border-esther-yellow z-10 bg-card">
                <div className="aspect-[4/3] flex items-center justify-center relative">
                  <Image
                    src="/esther-assets/avatar.jpg"
                    alt="AI 面试官"
                    width={120}
                    height={120}
                    className="rounded-full ring-2 ring-esther-blue"
                  />
                  {state.status === "asking" && ttsLoading === false && (
                    <div className="absolute bottom-2 right-2 flex items-end gap-0.5">
                      <div className="w-1 h-2 bg-esther-blue rounded-full animate-pulse" />
                      <div
                        className="w-1 h-3 bg-esther-blue rounded-full animate-pulse"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <div
                        className="w-1 h-1.5 bg-esther-blue rounded-full animate-pulse"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  )}
                </div>
                <div className="bg-card px-3 py-2 text-xs">
                  <p className="font-medium text-ink">{personaLabel}</p>
                  <p className="text-[10px] text-ink-muted">面试官</p>
                </div>
              </div>
            </>
          ) : (
            // 纯语音模式
            <div className="w-full max-w-[640px] px-10 text-center">
              <Image
                src="/esther-assets/avatar.jpg"
                alt="AI 面试官"
                width={120}
                height={120}
                className="rounded-full ring-2 ring-esther-blue mx-auto mb-6"
              />
              <p className="text-ink-muted text-[11px] font-display italic mb-2">
                {personaLabel} · {typeLabel}
              </p>
              {currentQuestion && (
                <p className="text-ink text-2xl md:text-3xl font-medium leading-relaxed">
                  {currentQuestion.text}
                </p>
              )}
            </div>
          )}

          {/* 状态提示 */}
          <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border text-xs text-ink-soft">
            {state.status === "asking" && (
              <>
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-esther-blue animate-pulse" />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-esther-blue animate-pulse"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-esther-blue animate-pulse"
                    style={{ animationDelay: "0.4s" }}
                  />
                </span>
                {ttsLoading ? "正在准备问题..." : "面试官说话中..."}
              </>
            )}
            {state.status === "listening" && (
              <>
                <span className="w-2 h-2 rounded-full bg-esther-red animate-pulse" />
                {inputMode === "text"
                  ? "等你打字答题"
                  : `听你回答中... (${asr.mode ?? "init"})`}
              </>
            )}
            {state.status === "thinking" && "思考中…"}
            {state.status === "paused" && "已暂停"}
          </div>

          {mediaError && (
            <div className="absolute top-6 left-6 max-w-[300px] px-3 py-2 rounded-lg bg-esther-red/10 border border-esther-red/30 text-[11px] text-esther-red">
              ⚠️ {mediaError}
            </div>
          )}

          {/* ASR 卡 init 兜底提示(plan offer-1-sparkling-hippo P1) */}
          {asrStuckOnInit && (
            <div className="absolute top-6 right-6 max-w-[340px] px-4 py-3 rounded-xl bg-esther-yellow/30 border border-esther-yellow text-xs text-ink">
              <p className="font-medium mb-1">🎙 暂时没检测到语音</p>
              <p className="text-[11px] text-ink-soft leading-relaxed mb-2">
                麦克风可能没授权 / 浏览器不支持语音识别,你可以一键切换到文字答题继续。
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode("text");
                    setAsrStuckOnInit(false);
                  }}
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-[11px] font-medium hover:bg-esther-blue-dark transition-colors"
                >
                  ⌨ 切到文字模式
                </button>
                <button
                  type="button"
                  onClick={() => setAsrStuckOnInit(false)}
                  className="text-[11px] text-ink-soft hover:text-ink"
                >
                  我再等等
                </button>
              </div>
            </div>
          )}

          {showSilenceTip && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,90%)] p-5 rounded-2xl bg-card border border-border shadow-2xl text-center">
              <p className="text-sm text-ink leading-relaxed mb-3">
                还在思考吗?需要 重复问题 / 给提示 / 跳过 这题吗?
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    ttsPlayedForIdx.current = null;
                    dispatch({ type: "SILENCE_SHOW", idx: -1 });
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors"
                >
                  🔁 重复问题
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleTipsOpen();
                    dispatch({ type: "SILENCE_SHOW", idx: -1 });
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors"
                >
                  💡 给提示
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "OPEN_SKIP" })}
                  className="text-xs px-3 py-1.5 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors"
                >
                  ⏭ 跳过
                </button>
              </div>
            </div>
          )}

          {/* 底部控件 */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-full bg-card/95 backdrop-blur-md border border-border shadow-lg">
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: state.status === "paused" ? "RESUME" : "PAUSE",
                })
              }
              className="w-11 h-11 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors flex items-center justify-center text-base"
            >
              {state.status === "paused" ? "▶" : "⏸"}
            </button>
            {state.status === "listening" && inputMode === "voice" && (
              <button
                type="button"
                onClick={() => dispatch({ type: "USER_ANSWER_DONE" })}
                disabled={
                  state.currentTranscript.trim().length === 0 &&
                  state.interimTranscript.trim().length === 0
                }
                className="px-4 h-11 rounded-full bg-esther-blue text-white hover:bg-esther-blue-dark transition-colors text-sm disabled:bg-ink-muted disabled:cursor-not-allowed"
              >
                ✓ 答完了
              </button>
            )}
            <button
              type="button"
              onClick={() => dispatch({ type: "OPEN_SKIP" })}
              className="px-4 h-11 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors text-sm text-ink-soft"
            >
              跳过 这题
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <button
              type="button"
              onClick={() => dispatch({ type: "FINISH" })}
              className="px-5 h-11 rounded-full bg-esther-red text-white hover:bg-esther-red/90 transition-colors text-sm font-medium"
            >
              结束面试 →
            </button>
          </div>
        </section>
      </div>

      {/* 表情管理小贴士 */}
      <div className="bg-warm-bg border-t border-border px-6 py-2 flex items-center justify-center gap-4 text-[11px] text-ink-muted">
        <span>🎭 提示:看摄像头(不要看屏幕)</span>
        <span>·</span>
        <span>不皱眉,放松脸</span>
        <span>·</span>
        <span>语速适中,深呼吸</span>
      </div>

      {/* 跳过 modal */}
      {state.showSkipModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => dispatch({ type: "CLOSE_SKIP" })}
        >
          <div
            className="bg-card rounded-2xl p-6 max-w-[400px] mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-ink mb-4 font-medium">你是?</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "SKIP", kind: "dont_know" })
                }
                className="w-full text-left p-3 rounded-xl border border-border hover:border-esther-blue transition-colors"
              >
                <p className="text-sm font-medium text-ink">不会答</p>
                <p className="text-[11px] text-ink-soft mt-1">
                  我会在复盘里给你这题的答题方向
                </p>
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "SKIP", kind: "know_but_skip" })
                }
                className="w-full text-left p-3 rounded-xl border border-border hover:border-esther-blue transition-colors"
              >
                <p className="text-sm font-medium text-ink">我会但想跳过</p>
                <p className="text-[11px] text-ink-soft mt-1">
                  标记为已掌握,后续不再出
                </p>
              </button>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "CLOSE_SKIP" })}
              className="mt-4 w-full text-xs text-ink-muted hover:text-ink"
            >
              取消,继续答
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
