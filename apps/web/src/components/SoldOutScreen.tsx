import Image from 'next/image'
import { LogoMark } from './LogoMark'

// Ring radius in the 200×200 viewBox; textLength = its circumference so the phrase closes the loop.
const R = 72
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * The whole site once the drop is sold out (see SoldOutGate): the logo bar, a slowly
 * rotating "SOLD OUT" ring around the Rp money-bag sign, and the post-payment money rain
 * on loop. The rain is the same multiply-blended clip as MoneyRain; muted + playsInline lets
 * it autoplay with no JS. Reduced-motion viewers get a still ring and no rain.
 */
export function SoldOutScreen() {
  return (
    <div className="sold-out">
      <header className="topbar">
        <div className="logo">
          <LogoMark />
        </div>
      </header>
      <section className="sold-out__stage">
        <h1 className="sold-out__badge" aria-label="Sold out">
          <svg className="sold-out__ring" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <path id="sold-out-circle" d={`M100,100 m-${R},0 a${R},${R} 0 1,1 ${R * 2},0 a${R},${R} 0 1,1 -${R * 2},0`} />
            </defs>
            <text>
              <textPath href="#sold-out-circle" textLength={CIRCUMFERENCE} lengthAdjust="spacing">
                SOLD OUT · SOLD OUT · SOLD OUT ·
              </textPath>
            </text>
          </svg>
          <Image src="/icons/rambu-rp.png" alt="" width={96} height={96} className="sold-out__sign" priority />
        </h1>
      </section>
      <div className="money-rain money-rain--loop" aria-hidden="true">
        <video src="/fx/money-rain.mp4" autoPlay muted loop playsInline preload="auto" />
      </div>
    </div>
  )
}
