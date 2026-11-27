/**
 * Decorative floating stickers and pixel stars for a section. CSS-only and compositor-friendly:
 * every animation touches transform/opacity, and all motion stops under reduced-motion.
 * The parent must establish a positioning context; slots are placed by `.sparks` rules, and
 * SparkGuard moves or hides any piece that would cover content unless the field is marked `free`.
 */
export function Sparks({ chips = [], stars = 5, className = "", free = false }: { chips?: string[]; stars?: number; className?: string; free?: boolean }) {
  return (
    <div className={`sparks ${className}`} aria-hidden="true" data-spark-free={free || undefined}>
      {chips.map((chip, index) => <span key={chip} className={`spark-chip spark-chip-${index + 1}`}>{chip}</span>)}
      {Array.from({ length: stars }, (_, index) => <i key={index} className={`spark-star spark-star-${index + 1}`} />)}
    </div>
  );
}
