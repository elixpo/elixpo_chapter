const calculateArrowHead = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  size: number = 10
) => {
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowAngle = Math.PI / 6; // 30 degrees

  const x1 = endX - size * Math.cos(angle - arrowAngle);
  const y1 = endY - size * Math.sin(angle - arrowAngle);
  const x2 = endX - size * Math.cos(angle + arrowAngle);
  const y2 = endY - size * Math.sin(angle + arrowAngle);

  return { x1, y1, x2, y2 };
};

export const ArrowPreview = ({
  startWorld,
  currentWorld,
}: {
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
}) => {
  const { x: startX, y: startY } = startWorld;
  const { x: endX, y: endY } = currentWorld;

  const arrowHead = calculateArrowHead(startX, startY, endX, endY, 12);

  // Calculate bounding box for the SVG
  const minX = Math.min(startX, endX, arrowHead.x1, arrowHead.x2) - 5;
  const minY = Math.min(startY, endY, arrowHead.y1, arrowHead.y2) - 5;
  const maxX = Math.max(startX, endX, arrowHead.x1, arrowHead.x2) + 5;
  const maxY = Math.max(startY, endY, arrowHead.y1, arrowHead.y2) + 5;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: minX,
        top: minY,
        width,
        height,
      }}
      aria-hidden>
      <line
        x1={startX - minX}
        y1={startY - minY}
        x2={endX - minX}
        y2={endY - minY}
        stroke="#666"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="3,3"
      />
      <polygon
        points={`${endX - minX},${endY - minY} ${arrowHead.x1 - minX},${arrowHead.y1 - minY} ${arrowHead.x2 - minX},${arrowHead.y2 - minY}`}
        fill="#666"
        stroke="#666"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeDasharray="2,2"
      />
    </svg>
  );
};
