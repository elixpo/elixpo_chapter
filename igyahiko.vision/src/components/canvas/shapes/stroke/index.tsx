import { polylineBox } from "@/lib/utils";
import { FreeDrawShape } from "@/redux/slices/shapes";

export const Stroke = ({ shape }: { shape: FreeDrawShape }) => {
  const { points, strokeWidth, stroke, fill } = shape;
  if (points.length < 2) return null;

  const { minX, minY, width, height } = polylineBox(points);
  const pad = strokeWidth;

  const dPts = points
    .map((p) => `${p.x - minX + pad},${p.y - minY + pad}`)
    .join(" ");

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: minX - pad,
        top: minY - pad,
        width: width + pad * 2,
        height: height + pad * 2,
      }}
      aria-hidden>
      <polyline
        points={dPts}
        fill={fill ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
