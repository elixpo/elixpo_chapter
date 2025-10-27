import { EllipseShape } from "@/redux/slices/shapes";

export const Elipse = ({ shape }: { shape: EllipseShape }) => (
  <div
    className="absolute border-solid pointer-events-none"
    style={{
      left: shape.x,
      top: shape.y,
      width: shape.w,
      height: shape.h,
      borderColor: shape.stroke,
      borderWidth: shape.strokeWidth,
      backgroundColor: shape.fill ?? "transparent",
      borderRadius: "50%",
      transform: `rotate(${shape.rotation || 0}deg)`,
      transformOrigin: 'center center'
    }}
  />
);
