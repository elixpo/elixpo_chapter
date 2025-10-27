export const RectanglePreview = ({
  startWorld,
  currentWorld,
  rotation = 0, // optional rotation angle in degrees
}: {
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
  rotation?: number;
}) => {
  const x = Math.min(startWorld.x, currentWorld.x);
  const y = Math.min(startWorld.y, currentWorld.y);
  const w = Math.abs(currentWorld.x - startWorld.x);
  const h = Math.abs(currentWorld.y - startWorld.y);

  return (
    <div
      className="absolute pointer-events-none border-2 border-gray-400"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: "8px",
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
      }}
    />
  );
};
