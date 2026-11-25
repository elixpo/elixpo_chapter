/**
 * The warm fundraiser backdrop: blush/peach glows, scattered hearts, coins and
 * sparkles, and hearts rising slowly from the bottom. Decorative only (all
 * styling in fundraiser.css under .fr-bg); shared by the fundraiser page and
 * the thank-you page.
 */

const HEART =
    "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z";
const SPARK = "M12 2l2.1 7.2L21 12l-6.9 2.8L12 22l-2.1-7.2L3 12l6.9-2.8z";

function Heart({ className }: { className: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24">
            <path d={HEART} fill="currentColor" />
        </svg>
    );
}
function Spark({ className }: { className: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24">
            <path d={SPARK} fill="currentColor" />
        </svg>
    );
}
function Coin({ className }: { className: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
                d="M8.5 8h7M8.5 11h7M9 8c4 0 4 6 0 6l5.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function HeartyBackground() {
    return (
        <div className="fr-bg" aria-hidden>
            <Heart className="b1" />
            <Coin className="b2" />
            <Spark className="b3" />
            <Heart className="b4" />
            <Spark className="b5" />
            <Coin className="b6" />
            <Heart className="b7" />
            {/* Hearts rising slowly from the bottom, like released balloons. */}
            <Heart className="r r1" />
            <Heart className="r r2" />
            <Heart className="r r3" />
            <Heart className="r r4" />
            <Heart className="r r5" />
            <Heart className="r r6" />
            <i className="o1" />
            <i className="o2" />
            <i className="o3" />
            <i className="glow g1" />
            <i className="glow g2" />
            <i className="glow g3" />
        </div>
    );
}

export { HEART, SPARK };
