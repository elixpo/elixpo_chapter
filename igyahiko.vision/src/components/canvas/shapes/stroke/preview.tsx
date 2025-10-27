import { polylineBox } from "@/lib/utils";

export const FreeDrawStrokePreview = ({
  points,
}: {
  points: ReadonlyArray<{ x: number; y: number }>;
}) => {
  if (points.length < 2) return null;

  const { minX, minY, width, height } = polylineBox(points);
  const pad = 2;

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
        fill="none"
        stroke="#666"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="3,3"
      />
    </svg>
  );
};
