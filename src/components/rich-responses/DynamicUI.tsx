"use client";

import type {
  DynamicUIData,
  DynamicUINode,
  DynamicUIColor,
  DynamicBarChart,
  DynamicChart,
  DynamicGrid,
  DynamicStack,
  DynamicCard,
  DynamicCallout,
  DynamicTimeline,
  DynamicStatRow,
  DynamicKeyValue,
} from "@/types/conversation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const MAX_DEPTH = 5;

const COLOR_MAP: Record<DynamicUIColor, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  slate: "bg-slate-400",
};

const BADGE_COLOR_MAP: Record<DynamicUIColor, string> = {
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  violet: "bg-violet-100 text-violet-700",
  blue: "bg-blue-100 text-blue-700",
  slate: "bg-slate-100 text-slate-600",
};

const BAR_COLORS = ["bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-blue-500", "bg-red-400"];

const SVG_COLORS: Record<DynamicUIColor, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  blue: "#3b82f6",
  slate: "#94a3b8",
};

const SVG_COLOR_CYCLE = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#06b6d4", "#ec4899"];

interface Props {
  data: DynamicUIData;
}

export function DynamicUI({ data }: Props) {
  return (
    <div className="my-4 glass-card rounded-xl p-5">
      {data.title && (
        <h3 className="text-[15px] font-bold text-foreground">{data.title}</h3>
      )}
      {data.description && (
        <p className="text-[13px] text-muted-foreground mt-0.5 mb-3">{data.description}</p>
      )}
      {!data.description && data.title && <div className="mb-3" />}
      {renderNode(data.layout, 0)}
    </div>
  );
}

function renderNode(node: DynamicUINode, depth: number): React.ReactNode {
  if (depth > MAX_DEPTH) return null;
  if (!node || typeof node !== "object" || !("type" in node)) return null;

  switch (node.type) {
    case "heading":
      return renderHeading(node.level, node.text);
    case "text":
      return renderText(node.content, node.muted);
    case "metric":
      return renderMetric(node);
    case "badge-group":
      return renderBadgeGroup(node.badges);
    case "progress-bar":
      return renderProgressBar(node);
    case "bar-chart":
      return renderBarChart(node);
    case "table":
      return renderTable(node.headers, node.rows);
    case "list":
      return renderList(node.items, node.ordered);
    case "grid":
      return renderGrid(node, depth);
    case "stack":
      return renderStack(node, depth);
    case "card":
      return renderCard(node, depth);
    case "chart":
      return renderChart(node as DynamicChart);
    case "divider":
      return <div className="h-px bg-border/40 my-2" />;
    case "callout":
      return renderCallout(node as DynamicCallout);
    case "timeline":
      return renderTimeline(node as DynamicTimeline);
    case "stat-row":
      return renderStatRow(node as DynamicStatRow);
    case "key-value":
      return renderKeyValue(node as DynamicKeyValue);
    default:
      return null;
  }
}

function renderHeading(level: number, text: string) {
  const classes: Record<number, string> = {
    1: "text-lg font-bold text-foreground",
    2: "text-[15px] font-semibold text-foreground",
    3: "text-[14px] font-semibold text-foreground",
  };
  const Tag = (`h${Math.min(Math.max(level, 1), 3)}`) as "h1" | "h2" | "h3";
  return <Tag className={classes[level] || classes[2]}>{text}</Tag>;
}

function renderText(content: string, muted?: boolean) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={`text-[13px] leading-relaxed ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function renderMetric(node: { label: string; value: string; subtext?: string; trend?: string; trendValue?: string }) {
  return (
    <div className="glass-card rounded-xl px-4 py-3.5 hover:shadow-glass-lg transition-all">
      <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.06em]">{node.label}</p>
      <p className="text-2xl font-bold text-foreground mt-1.5 leading-none">{node.value}</p>
      {node.subtext && <p className="text-[11px] text-muted-foreground mt-1.5">{node.subtext}</p>}
      {node.trend && node.trend !== "neutral" && (
        <div className={`flex items-center gap-1 mt-2 text-[11px] font-semibold ${node.trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
          {node.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {node.trendValue}
        </div>
      )}
    </div>
  );
}

function renderBadgeGroup(badges: { text: string; color?: DynamicUIColor }[]) {
  if (!Array.isArray(badges)) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {badges.map((badge, i) => (
        <span
          key={i}
          className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${BADGE_COLOR_MAP[badge.color || "slate"]}`}
        >
          {badge.text}
        </span>
      ))}
    </div>
  );
}

function renderProgressBar(node: { label: string; value: number; color?: DynamicUIColor; showValue?: boolean; suffix?: string }) {
  const pct = Math.max(0, Math.min(100, node.value));
  const colorClass = COLOR_MAP[node.color || "indigo"];
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-[12px] text-muted-foreground">{node.label}</span>
        {node.showValue !== false && (
          <span className="text-[12px] font-semibold text-foreground tabular-nums">{pct}{node.suffix || "%"}</span>
        )}
      </div>
      <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function renderBarChart(node: DynamicBarChart) {
  if (!Array.isArray(node.bars)) return null;
  const max = node.maxValue || Math.max(...node.bars.map((b) => b.value), 1);
  return (
    <div className="space-y-2.5">
      {node.title && <p className="text-[13px] font-semibold text-foreground/80 mb-1">{node.title}</p>}
      {node.bars.map((bar, i) => {
        const pct = Math.max(0, (bar.value / max) * 100);
        const colorClass = bar.color ? COLOR_MAP[bar.color] : BAR_COLORS[i % BAR_COLORS.length];
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-[12px] text-muted-foreground w-24 text-right flex-shrink-0 truncate">{bar.label}</span>
            <div className="flex-1 h-6 bg-muted/40 rounded-md overflow-hidden">
              <div className={`h-full rounded-md ${colorClass}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[12px] font-semibold text-foreground w-20 flex-shrink-0 tabular-nums">
              {typeof bar.value === "number" && bar.value >= 1000
                ? `$${(bar.value / 1000).toFixed(0)}K`
                : String(bar.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function renderTable(headers: string[], rows: string[][]) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) return null;
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
            {headers.map((h, i) => (
              <TableHead key={i} className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} className="border-b border-border/30">
              {row.map((cell, j) => (
                <TableCell key={j} className="text-[13px] py-3">{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function renderList(items: { label: string; value?: string }[], ordered?: boolean) {
  if (!Array.isArray(items)) return null;
  return (
    <div className="space-y-0">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between py-2 border-b border-border/30 last:border-b-0">
          <span className="text-[13px] text-muted-foreground">
            {ordered ? `${i + 1}. ` : ""}{item.label}
          </span>
          {item.value && (
            <span className="text-[13px] font-medium text-foreground/80">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== Chart Rendering =====

function renderChart(node: DynamicChart) {
  if (!Array.isArray(node.data) || node.data.length === 0) return null;
  const showLegend = node.showLegend !== false;

  switch (node.chartType) {
    case "pie":
    case "donut":
      return renderPieChart(node, node.chartType === "donut");
    case "line":
    case "area":
      return renderLineChart(node, node.chartType === "area");
    case "vertical-bar":
      return renderVerticalBarChart(node);
    default:
      return renderPieChart(node, false);
  }
}

function getChartColor(index: number, color?: DynamicUIColor): string {
  if (color && SVG_COLORS[color]) return SVG_COLORS[color];
  return SVG_COLOR_CYCLE[index % SVG_COLOR_CYCLE.length];
}

function renderPieChart(node: DynamicChart, isDonut: boolean) {
  const total = node.data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  if (total === 0) return null;

  const cx = 100, cy = 100, r = 80;
  const innerR = isDonut ? 48 : 0;
  let currentAngle = -Math.PI / 2;

  const slices = node.data.map((d, i) => {
    const pct = d.value / total;
    const angle = pct * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const color = getChartColor(i, d.color);

    let path: string;
    if (isDonut) {
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    } else {
      path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    return { path, color, label: d.label, value: d.value, pct };
  });

  return (
    <div>
      {node.title && <p className="text-[13px] font-semibold text-foreground/80 mb-3">{node.title}</p>}
      <div className="flex items-center gap-6">
        <svg viewBox="0 0 200 200" className="w-44 h-44 flex-shrink-0">
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth="2" />
          ))}
          {isDonut && (
            <text x={cx} y={cy + 4} textAnchor="middle" className="fill-foreground text-[14px] font-bold">
              {formatChartValue(total)}
            </text>
          )}
        </svg>
        {node.showLegend !== false && (
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {slices.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <span className="text-[12px] text-muted-foreground truncate flex-1">{s.label}</span>
                <span className="text-[12px] font-semibold text-foreground tabular-nums">{formatChartValue(s.value)}</span>
                <span className="text-[11px] text-muted-foreground/60 tabular-nums w-10 text-right">{(s.pct * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderLineChart(node: DynamicChart, isFilled: boolean) {
  const values = node.data.map((d) => Math.max(0, d.value));
  const maxVal = Math.max(...values, 1);
  const padX = 50, padY = 24, padBottom = 30;
  const w = 500, h = 210;
  const chartW = w - padX - 10, chartH = h - padY - padBottom;

  const points = values.map((v, i) => {
    const x = padX + (i / Math.max(values.length - 1, 1)) * chartW;
    const y = padY + chartH - (v / maxVal) * chartH;
    return { x, y };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${padX},${padY + chartH} ${linePoints} ${padX + chartW},${padY + chartH}`;
  const color = getChartColor(0, node.data[0]?.color);

  return (
    <div>
      {node.title && <p className="text-[13px] font-semibold text-foreground/80 mb-3">{node.title}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = padY + chartH - pct * chartH;
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={padX + chartW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padX - 6} y={y + 4} textAnchor="end" className="fill-muted-foreground" fontSize="10">
                {formatChartValue(maxVal * pct)}
              </text>
            </g>
          );
        })}
        {/* Area fill */}
        {isFilled && <polygon points={areaPoints} fill={color} opacity="0.15" />}
        {/* Line */}
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} stroke="white" strokeWidth="2" />
        ))}
        {/* X labels */}
        {node.data.map((d, i) => {
          const x = padX + (i / Math.max(values.length - 1, 1)) * chartW;
          return (
            <text key={i} x={x} y={h - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function renderVerticalBarChart(node: DynamicChart) {
  const values = node.data.map((d) => Math.max(0, d.value));
  const maxVal = Math.max(...values, 1);
  const padX = 50, padY = 28, padBottom = 40;
  const w = 500, h = 240;
  const chartW = w - padX - 10, chartH = h - padY - padBottom;
  const barWidth = Math.min(40, chartW / node.data.length * 0.6);
  const gap = chartW / node.data.length;

  return (
    <div>
      {node.title && <p className="text-[13px] font-semibold text-foreground/80 mb-3">{node.title}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = padY + chartH - pct * chartH;
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={padX + chartW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padX - 6} y={y + 4} textAnchor="end" className="fill-muted-foreground" fontSize="10">
                {formatChartValue(maxVal * pct)}
              </text>
            </g>
          );
        })}
        {/* Bars */}
        {node.data.map((d, i) => {
          const barH = (d.value / maxVal) * chartH;
          const x = padX + gap * i + (gap - barWidth) / 2;
          const y = padY + chartH - barH;
          const color = getChartColor(i, d.color);
          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={color} />
              <text x={x + barWidth / 2} y={h - padBottom + 14} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
                {d.label}
              </text>
              {node.showValues !== false && (
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="fill-foreground" fontSize="10" fontWeight="600">
                  {formatChartValue(d.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function formatChartValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function renderGrid(node: DynamicGrid, depth: number) {
  const cols = Math.max(1, Math.min(4, node.columns || 1));
  const colClass: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  };
  return (
    <div className={`grid ${colClass[cols]} gap-3`}>
      {(node.children || []).map((child, i) => (
        <div key={i}>{renderNode(child, depth + 1)}</div>
      ))}
    </div>
  );
}

function renderStack(node: DynamicStack, depth: number) {
  const gapClass: Record<string, string> = { sm: "gap-2", md: "gap-4", lg: "gap-6" };
  const dir = node.direction === "horizontal" ? "flex-row" : "flex-col";
  return (
    <div className={`flex ${dir} ${gapClass[node.gap || "md"]}`}>
      {(node.children || []).map((child, i) => (
        <div key={i} className={node.direction === "horizontal" ? "flex-1 min-w-0" : ""}>{renderNode(child, depth + 1)}</div>
      ))}
    </div>
  );
}

function renderCard(node: DynamicCard, depth: number) {
  return (
    <div className="glass-card rounded-xl p-4">
      {node.title && (
        <p className="text-[14px] font-semibold text-foreground mb-3">{node.title}</p>
      )}
      <div className="space-y-3">
        {(node.children || []).map((child, i) => (
          <div key={i}>{renderNode(child, depth + 1)}</div>
        ))}
      </div>
    </div>
  );
}

function renderCallout(node: DynamicCallout) {
  const variants = {
    info: { bg: "bg-blue-50/80 dark:bg-blue-950/30", border: "border-blue-200/60 dark:border-blue-800/40", text: "text-blue-800 dark:text-blue-300", icon: <Info className="w-4 h-4" /> },
    warning: { bg: "bg-amber-50/80 dark:bg-amber-950/30", border: "border-amber-200/60 dark:border-amber-800/40", text: "text-amber-800 dark:text-amber-300", icon: <AlertTriangle className="w-4 h-4" /> },
    success: { bg: "bg-emerald-50/80 dark:bg-emerald-950/30", border: "border-emerald-200/60 dark:border-emerald-800/40", text: "text-emerald-800 dark:text-emerald-300", icon: <CheckCircle2 className="w-4 h-4" /> },
    error: { bg: "bg-red-50/80 dark:bg-red-950/30", border: "border-red-200/60 dark:border-red-800/40", text: "text-red-800 dark:text-red-300", icon: <XCircle className="w-4 h-4" /> },
  };
  const v = variants[node.variant] || variants.info;
  return (
    <div className={`px-4 py-3 rounded-xl border ${v.bg} ${v.border}`}>
      <div className={`flex items-start gap-2.5 ${v.text}`}>
        <span className="mt-0.5 flex-shrink-0">{v.icon}</span>
        <div>
          {node.title && <p className="font-semibold text-[13px] mb-0.5">{node.title}</p>}
          <p className="text-[12px] opacity-90">{node.content}</p>
        </div>
      </div>
    </div>
  );
}

function renderTimeline(node: DynamicTimeline) {
  if (!Array.isArray(node.items)) return null;
  return (
    <div className="space-y-0">
      {node.items.map((item, i) => (
        <div key={i} className="flex gap-3 relative">
          {i < node.items.length - 1 && (
            <div className="absolute left-[7px] top-[18px] bottom-0 w-px bg-border/60" />
          )}
          <div className={`w-[14px] h-[14px] rounded-full flex-shrink-0 mt-1 z-10 ring-2 ring-background ${COLOR_MAP[item.color || "indigo"]}`} />
          <div className="flex-1 pb-3 min-w-0">
            <p className="text-[13px] font-medium text-foreground">{item.label}</p>
            {item.description && <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>}
            {item.timestamp && <p className="text-[10px] text-muted-foreground/50 mt-0.5">{item.timestamp}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderStatRow(node: DynamicStatRow) {
  if (!Array.isArray(node.stats)) return null;
  return (
    <div className="flex gap-4 overflow-x-auto">
      {node.stats.map((stat, i) => (
        <div key={i} className="flex-1 min-w-[120px] glass-card rounded-xl p-3">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{stat.label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[18px] font-bold text-foreground">{stat.value}</span>
            {stat.change && (
              <span className={`text-[11px] font-medium flex items-center gap-0.5 ${
                stat.trend === "up" ? "text-emerald-600" : stat.trend === "down" ? "text-red-500" : "text-muted-foreground"
              }`}>
                {stat.trend === "up" && <TrendingUp className="w-3 h-3" />}
                {stat.trend === "down" && <TrendingDown className="w-3 h-3" />}
                {stat.change}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderKeyValue(node: DynamicKeyValue) {
  // LLMs sometimes emit the pairs under "children" instead of "pairs"
  const pairs = node.pairs ?? (node as unknown as { children?: DynamicKeyValue["pairs"] }).children;
  if (!Array.isArray(pairs)) return null;
  const cols = node.columns || 2;
  return (
    <div className={`grid gap-3 ${cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {pairs.map((pair, i) => (
        <div key={i} className="flex flex-col">
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{pair.key}</span>
          <span className="text-[13px] font-medium text-foreground mt-0.5">{pair.value}</span>
        </div>
      ))}
    </div>
  );
}
