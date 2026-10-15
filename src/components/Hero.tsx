import { ArrowDown, ArrowUpRight } from 'lucide-react'

interface HeroProps { onStart: () => void }

export function Hero({ onStart }: HeroProps) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div>
        <p className="eyebrow">Different languages. Equal say.</p>
        <h1 id="hero-title" className="display hero-title">
          Find the words.<br />
          <span className="hero-highlight">Keep your voice.</span>
        </h1>
        <p className="hero-description">A shared space for two people to understand each other.
          Even when you don’t agree.</p>
        <button type="button" onClick={onStart} className="primary-action">
          Start a conversation <ArrowDown size={18} aria-hidden />
        </button>
        <p className="hero-caption">One device. Two perspectives. 15 languages.</p>
      </div>
      <aside className="how-it-works" aria-label="How to have a conversation">
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow">Make room for each other</p>
          <ArrowUpRight size={22} aria-hidden />
        </div>
        <ol>
          <li><span>01</span><div><strong>Choose your languages.</strong><p>A language for you. A language for them.</p></div></li>
          <li><span>02</span><div><strong>Say it your way.</strong><p>Type, or dictate when available. Review, then send.</p></div></li>
          <li><span>03</span><div><strong>Hear the other side.</strong><p>Read the translation, listen if a voice is installed, and take turns.</p></div></li>
        </ol>
        <p className="how-note">You don’t have to agree to understand.</p>
      </aside>
    </section>
  )
}
