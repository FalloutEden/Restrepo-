"use client";

import { useState } from "react";

export function Memorial() {
  const [isVisible, setIsVisible] = useState(true);

  return (
    <section className="memorial-shell" aria-label="Memorial for Elsa">
      <div className="memorial-header-row">
        <p className="memorial-kicker">Memorial</p>
        <button
          type="button"
          className="memorial-toggle"
          onClick={() => setIsVisible((current) => !current)}
          aria-expanded={isVisible}
        >
          {isVisible ? "Hide" : "Show"}
        </button>
      </div>

      {isVisible ? (
        <div className="memorial-card">
          <img className="memorial-image" src="/images/elsa.jpg" alt="Elsa" />
          <div className="memorial-copy">
            <p className="memorial-title">In loving memory of Elsa</p>
            <p className="memorial-dates">08/2014 - 09/2025</p>
            <p className="memorial-message">Keeping my promise.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
