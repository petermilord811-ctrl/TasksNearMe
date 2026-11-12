/** A little Austin sunshine, drawn in the same cut-paper shapes as the brand. */
export function HomeHeroIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 570" fill="none" aria-hidden="true" focusable="false">
      {/* An arched window into the neighborhood. */}
      <path d="M76 494V255C76 129 172 35 298 35S524 129 524 255V494H76Z" fill="var(--art-paper)" />
      <circle cx="405" cy="149" r="59" fill="var(--art-sun)" />
      <path d="M172 127H220M187 117H235M108 203H151M121 193H165" stroke="var(--background)" strokeWidth="8" strokeLinecap="round" />

      {/* Austin's low skyline, with a dome and a stepped tower. */}
      <path d="M130 280V239H164V222H194V280M204 280V215H222V203H240V188H255V203H273V215H290V280M304 280V182H315V170H341V182H352V280M367 280V230H402V280M418 280V207H450V280M460 280V245H490V280" fill="var(--art-sage)" />
      <path d="M228 203C228 184 237 176 247 176C257 176 266 184 266 203M247 165V176" stroke="var(--art-sage)" strokeWidth="7" strokeLinecap="round" />
      <path d="M320 199H336M320 215H336M320 231H336M320 247H336M236 223V241M258 223V241M433 225V240" stroke="var(--art-paper)" strokeWidth="5" />
      <path d="M76 280C149 247 204 263 282 285C365 308 444 252 524 277V494H76V280Z" fill="var(--brand-soft)" />
      <path d="M76 330C174 286 253 340 323 343C399 348 465 309 524 324V494H76V330Z" fill="var(--art-sage)" opacity="0.45" />

      {/* A house, just far enough away to feel like a neighborhood. */}
      <path d="M96 304L139 269L182 304V350H96V304Z" fill="var(--card)" />
      <path d="M88 306L139 264L190 306" stroke="var(--art-clay)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M130 350V319H149V350" fill="var(--art-clay)" />
      <path d="M106 317H119V331H106ZM160 317H173V331H160Z" fill="var(--art-sage)" />

      {/* A generous oak leaf and its small neighbor. */}
      <path d="M475 355V266" stroke="var(--art-line)" strokeWidth="5" strokeLinecap="round" />
      <path d="M475 317C436 311 438 279 447 263C475 270 487 290 475 317Z" fill="var(--art-ink)" />
      <path d="M475 294C507 285 511 257 503 240C474 245 461 266 475 294Z" fill="var(--art-sage)" />
      <path d="M475 268C448 250 448 226 462 212C485 224 491 245 475 268Z" fill="var(--art-ink)" />
      <path d="M475 346C502 343 516 325 511 307C485 307 471 322 475 346Z" fill="var(--art-sage)" />

      <ellipse cx="302" cy="493" rx="251" ry="38" fill="var(--art-line)" opacity="0.1" />

      {/* The finished desk: sturdy joints and a warm wooden top. */}
      <path d="M160 365H421L447 388H136L160 365Z" fill="var(--art-sun)" />
      <path d="M136 388H447V403H136V388Z" fill="var(--art-clay)" />
      <path d="M158 403H177L167 492H149L158 403ZM408 403H427L437 492H419L408 403Z" fill="var(--art-ink)" />
      <path d="M172 404H412V425H172V404Z" fill="var(--art-paper)" />
      <path d="M172 425H412" stroke="var(--art-clay)" strokeWidth="3" />
      <path d="M280 414H303" stroke="var(--art-line)" strokeWidth="4" strokeLinecap="round" />

      {/* A laptop ready for its first use. */}
      <path d="M226 303C226 299 229 296 233 296H334C338 296 341 299 341 303V368H226V303Z" fill="var(--art-ink)" />
      <path d="M234 304H333V359H234V304Z" fill="var(--card)" />
      <path d="M234 346L270 318L299 343L316 329L333 343V359H234V346Z" fill="var(--brand-soft)" />
      <circle cx="313" cy="319" r="8" fill="var(--art-sun)" />
      <path d="M226 368H341L354 378H212L226 368Z" fill="var(--art-ink)" />
      <path d="M273 370H295" stroke="var(--art-paper)" strokeWidth="3" strokeLinecap="round" />

      {/* The useful things: a lamp, a notebook, and a mug. */}
      <path d="M380 365H415M398 365V313L375 291" stroke="var(--art-line)" strokeWidth="5" strokeLinecap="round" />
      <path d="M350 290C350 274 364 263 376 269L391 281L366 310L350 290Z" fill="var(--art-clay)" />
      <path d="M363 309L389 280" stroke="var(--art-line)" strokeWidth="4" strokeLinecap="round" />
      <path d="M177 366H207V373H177Z" fill="var(--card)" />
      <path d="M180 359H209V365H180Z" fill="var(--art-sage)" />
      <path d="M177 333H197V354C197 358 193 361 187 361C181 361 177 358 177 354V333Z" fill="var(--art-clay)" />
      <path d="M197 337H201C211 337 211 350 201 350H197" stroke="var(--art-clay)" strokeWidth="4" />

      {/* A terracotta pot and deliberately imperfect botanical shapes. */}
      <path d="M91 441V358M91 391L68 371M91 415L115 391" stroke="var(--art-line)" strokeWidth="4" strokeLinecap="round" />
      <path d="M90 384C67 377 62 353 73 339C94 344 104 365 90 384Z" fill="var(--art-ink)" />
      <path d="M89 403C107 377 130 380 135 390C122 413 106 417 89 403Z" fill="var(--art-sage)" />
      <path d="M76 389C52 392 40 379 42 362C61 360 76 372 76 389Z" fill="var(--art-sage)" />
      <path d="M66 432H119L112 486C110 496 77 496 74 486L66 432Z" fill="var(--art-clay)" />
      <path d="M62 426H123V440H62Z" fill="var(--art-clay)" />
      <path d="M82 447L85 479M100 447L98 479" stroke="var(--art-paper)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />

      {/* A packed box with its simple carry-handle. */}
      <path d="M455 398L519 383L558 410L492 429L455 398Z" fill="var(--art-sun)" />
      <path d="M455 398L492 429V495L455 469V398Z" fill="var(--art-clay)" />
      <path d="M492 429L558 410V477L492 495V429Z" fill="var(--art-paper)" />
      <path d="M488 390L527 419V439L516 442V421L477 393" fill="var(--card)" />
      <path d="M517 459L538 453" stroke="var(--art-line)" strokeWidth="5" strokeLinecap="round" />

      {/* A compact toolbox, left out for the next task. */}
      <path d="M265 461V448C265 442 271 438 278 438H305C312 438 318 442 318 448V461" stroke="var(--art-ink)" strokeWidth="7" />
      <rect x="242" y="456" width="100" height="51" rx="7" fill="var(--art-ink)" />
      <path d="M242 476H342" stroke="var(--art-paper)" strokeWidth="2" opacity="0.5" />
      <path d="M282 469H301V485H282Z" fill="var(--art-sun)" />

      {/* Small printmaking flourishes, never product data. */}
      <path d="M56 142V164M45 153H67M530 179V197M521 188H539" stroke="var(--art-clay)" strokeWidth="3" strokeLinecap="round" />
      <path d="M209 514C217 509 225 510 230 514M365 522C374 517 382 519 386 522" stroke="var(--art-sage)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="548" cy="297" r="4" fill="var(--art-clay)" />
      <circle cx="117" cy="107" r="3" fill="var(--art-sage)" />
    </svg>
  );
}
