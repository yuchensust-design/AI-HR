/**
 * RIASEC 雷达图 — 6 维度可视化(Server-rendered SVG,无 client JS)
 * scores: [R, I, A, S, E, C]
 * maxScore: 单维满分(18REST-2 是 15,旧版是 10)
 */

type Props = {
  scores: [number, number, number, number, number, number];
  size?: number;
  maxScore?: number;
};

const LABELS_EN = ["R", "I", "A", "S", "E", "C"];
const LABELS_CN = ["实用", "研究", "艺术", "社交", "企业", "常规"];

export function RIASECRadar({ scores, size = 320, maxScore = 15 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 56; // 留 padding 给标签

  // 6 个顶点角度(从 12 点钟方向起,顺时针)
  const angles = LABELS_EN.map(
    (_, i) => (Math.PI * 2 * i) / 6 - Math.PI / 2
  );

  // 同心 4 级 polygon
  const levels = [0.25, 0.5, 0.75, 1.0];

  // 数据 polygon 点(scores 归一化到 0-1)
  const dataPoints = scores.map((score, i) => {
    const r = (radius * Math.min(score, maxScore)) / maxScore;
    return {
      x: cx + r * Math.cos(angles[i]),
      y: cy + r * Math.sin(angles[i]),
    };
  });
  const polygonPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[320px] mx-auto"
      role="img"
      aria-label="RIASEC 6 维度雷达图"
    >
      {/* 同心背景 */}
      {levels.map((level, i) => {
        const pts = angles
          .map((a) => {
            const r = radius * level;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          })
          .join(" ");
        return (
          <polygon
            key={i}
            points={pts}
            fill={i === levels.length - 1 ? "#fefcf6" : "none"}
            stroke="#e8e2d2"
            strokeWidth="1"
          />
        );
      })}

      {/* 6 轴 */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + radius * Math.cos(a)}
          y2={cy + radius * Math.sin(a)}
          stroke="#e8e2d2"
          strokeWidth="1"
        />
      ))}

      {/* 数据 polygon */}
      <polygon
        points={polygonPath}
        fill="#2B7FD8"
        fillOpacity="0.22"
        stroke="#2B7FD8"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="#2B7FD8"
          stroke="#fefcf6"
          strokeWidth="2"
        />
      ))}

      {/* 标签 */}
      {angles.map((a, i) => {
        const labelX = cx + (radius + 28) * Math.cos(a);
        const labelY = cy + (radius + 28) * Math.sin(a);
        return (
          <g key={i}>
            {/* 数字(主导色) */}
            <text
              x={labelX}
              y={labelY - 13}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="13"
              fontWeight="700"
              fontStyle="italic"
              fontFamily="var(--font-display)"
              fill="#2B7FD8"
            >
              {scores[i]}
            </text>
            {/* 字母 */}
            <text
              x={labelX}
              y={labelY + 3}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="15"
              fontWeight="700"
              fill="#1A1A2E"
            >
              {LABELS_EN[i]}
            </text>
            {/* 中文小字 */}
            <text
              x={labelX}
              y={labelY + 18}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill="#888"
            >
              {LABELS_CN[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
