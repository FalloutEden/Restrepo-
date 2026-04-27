"use client";

import { useState } from "react";

export function Memorial() {
  const [open, setOpen] = useState(false);

  return (
    <div className="memorial-bar">
      <button
        type="button"
        className="memorial-pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="memorial-pill-dot" aria-hidden="true" />
        In memory of Elsa &nbsp;·&nbsp; 08/2014 – 09/2025
        <span className="memorial-pill-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="memorial-expand">
          <img className="memorial-photo" src="/images/elsa.jpg" alt="Elsa" />
          <p className="memorial-msg">Keeping my promise.</p>
        </div>
      )}
    </div>
  );
}
