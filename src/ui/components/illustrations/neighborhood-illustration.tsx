/** A decorative neighborhood, not a map or a representation of an exact address. */
export function NeighborhoodIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 580 360" fill="none" aria-hidden="true" focusable="false">
      <path d="M47 274C17 203 64 117 143 102C215 87 220 40 312 41C403 43 430 97 490 130C553 165 559 257 507 300C462 338 390 315 314 329C217 347 79 349 47 274Z" fill="var(--art-paper)" />
      <path d="M71 281C144 251 170 223 233 234C300 246 300 289 378 275C430 266 449 225 518 228" stroke="var(--art-sage)" strokeWidth="30" strokeLinecap="round" />
      <path d="M90 143L481 280M165 92L137 302M330 70L281 315M476 147L427 308M69 211L505 169" stroke="var(--background)" strokeWidth="12" strokeLinecap="round" />

      {/* Three houses share the same simple, welcoming silhouette. */}
      <path d="M171 161L207 134L243 161V208H171V161Z" fill="var(--card)" />
      <path d="M164 163L207 129L250 163" stroke="var(--art-clay)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M198 208V182H214V208M181 175H190V187H181ZM224 175H233V187H224Z" fill="var(--art-ink)" />

      <path d="M339 215L371 191L403 215V254H339V215Z" fill="var(--art-sun)" />
      <path d="M333 217L371 186L409 217" stroke="var(--art-clay)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M364 254V232H379V254M348 226H356V238H348ZM387 226H395V238H387Z" fill="var(--art-line)" />

      <path d="M396 116L424 95L452 116V151H396V116Z" fill="var(--card)" />
      <path d="M390 118L424 91L458 118" stroke="var(--art-ink)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M418 151V130H432V151M404 127H411V138H404ZM438 127H445V138H438Z" fill="var(--art-sage)" />

      {/* Oaks and garden patches. */}
      <path d="M92 211V174M262 133V93M472 297V260M199 298V264" stroke="var(--art-line)" strokeWidth="4" strokeLinecap="round" />
      <path d="M92 193C67 190 68 158 80 144C104 149 112 175 92 193Z" fill="var(--art-ink)" />
      <path d="M93 181C101 159 120 155 131 168C124 190 108 197 93 181Z" fill="var(--art-sage)" />
      <path d="M262 111C240 105 241 81 252 68C275 75 280 96 262 111Z" fill="var(--art-sage)" />
      <path d="M263 118C272 97 288 98 296 107C291 126 274 131 263 118Z" fill="var(--art-ink)" />
      <path d="M472 279C453 277 445 253 458 237C480 244 489 261 472 279Z" fill="var(--art-ink)" />
      <path d="M472 273C481 252 500 250 510 263C503 280 486 286 472 273Z" fill="var(--art-sage)" />
      <path d="M199 280C178 277 173 255 183 243C206 248 212 268 199 280Z" fill="var(--art-sage)" />
      <path d="M197 288C207 269 223 267 232 279C222 297 209 298 197 288Z" fill="var(--art-ink)" />

      {/* The brand's pin checks in on the whole neighborhood. */}
      <ellipse cx="325" cy="154" rx="25" ry="7" fill="var(--art-line)" opacity="0.13" />
      <path d="M325 61C306 61 291 76 291 94C291 120 325 147 325 147S359 120 359 94C359 76 344 61 325 61Z" fill="var(--primary)" />
      <path d="M313 95L322 104L339 86" stroke="var(--primary-foreground)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="466" cy="66" r="23" fill="var(--art-sun)" />
      <path d="M121 90V106M113 98H129M520 119V133M513 126H527" stroke="var(--art-clay)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
