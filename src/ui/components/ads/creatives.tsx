import type { CSSProperties } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowRight, Check, Minus, Square, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SPONSORED_ADVERTISERS } from '@/contracts/ads';
import { AdFrames } from './ad-frames';

/*
 * The two creatives (ads.css has their looks). Each is three frames in its advertiser's style: a scene (a generated
 * photo), the product at work, and the offer with its button, then it rests on the offer. Their claims are the
 * advertisers' own (their sites, 2026-11-22). The photos are generated for these ads; the marks are the advertisers'.
 */

/** When a piece of a frame comes in, in ms after the frame does (ads.css reads `--d`). */
const at = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** Words that come in one after another, each with its space, so a caret after them moves along. */
function Typed({ text, start, step }: { text: string; start: number; step: number }) {
  const words = text.split(' ');
  return words.map((word, index) => <span key={index} className="ad-word" style={at(start + index * step)}>{index < words.length - 1 ? `${word} ` : word}</span>);
}

/** HumanizeWord's mark (their icon.svg): a lime tile with the H and its dot. */
export function HumanizeWordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="19" fill="#d8f36a" />
      <path d="M19 20v26M45 20v26M19 34c7-7 19-7 26 0" stroke="#183e35" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="32" cy="17" r="3.5" fill="#183e35" />
    </svg>
  );
}

/** HumanizeWord's lockup: the mark, then "humanize" bold, "word" light and a lime dot (a logo, not copy). */
function HumanizeWordLogo({ className = 'hw-brand', style }: { className?: string; style?: CSSProperties }) {
  return <div className={className} style={style}><HumanizeWordIcon className="hw-icon" /><span className="hw-wordmark"><b>humanize</b>word<i>.</i></span></div>;
}

export function HumanizeWordCreative({ still }: { still?: number }) {
  const t = useTranslations('ads.humanizeword');
  return (
    <AdFrames
      className="ad-creative hw"
      durations={[4200, 6000, 4600]}
      {...(still === undefined ? {} : { still })}
      placeholder={{
        className: 'hw-holder',
        children: <>
          {/* Fetched with the page, so the first frame's photo is there when it starts. */}
          <Image unoptimized className="ad-cover opacity-0" src="/ui/ads/humanizeword-writer.webp" alt="" width={720} height={600} />
          <HumanizeWordLogo />
        </>,
      }}
      frames={[
        {
          children: <>
            <Image unoptimized className="ad-cover hw-photo ad-kenburns" src="/ui/ads/humanizeword-writer.webp" alt="" width={720} height={600} />
            <div className="hw-shade" />
            <div className="hw-top"><HumanizeWordLogo className="hw-brand ad-in" style={at(120)} /></div>
            <div className="hw-hero">
              <p className="hw-serif hw-hero-title">
                <span className="ad-line"><span style={at(320)}>{t('heroLine1')}</span></span>
                <span className="ad-line hw-lime"><span style={at(620)}><em>{t('heroLine2')}</em></span></span>
              </p>
              <p className="hw-kicker ad-in" style={at(1100)}>{t('tagline')}</p>
            </div>
          </>,
        },
        {
          className: 'hw-demo',
          children: <>
            <Image unoptimized className="ad-cover hw-demo-photo" src="/ui/ads/humanizeword-typing.webp" alt="" width={600} height={500} />
            <p className="hw-eyebrow ad-in" style={at(80)}><span>{t('example')}</span><HumanizeWordIcon className="hw-icon" /></p>
            <div className="hw-card ad-in" style={at(200)}>
              <div className="hw-before">
                <p className="hw-tag">{t('original')}</p>
                <p className="hw-quote"><span className="hw-strike" style={at(1250)}>{t('originalText')}</span></p>
              </div>
              <div className="hw-divider"><span className="hw-arrow ad-pop" style={at(1700)}><ArrowDown strokeWidth={2.75} /></span></div>
              <div className="hw-after">
                <p className="hw-tag hw-tag-new ad-in" style={at(1900)}>{t('rewrite')}</p>
                <p className="hw-quote"><Typed text={t('rewriteText')} start={2150} step={170} /><span className="hw-caret" style={at(2150)} /></p>
              </div>
            </div>
            <div className="hw-tones">
              <span className="hw-tones-label ad-in" style={at(500)}>{t('tone')}</span>
              <span className="hw-tone ad-pop" data-on="" style={at(650)}><Check strokeWidth={3} />{t('tones.warm')}</span>
              <span className="hw-tone ad-pop" style={at(760)}>{t('tones.direct')}</span>
              <span className="hw-tone ad-pop" style={at(870)}>{t('tones.formal')}</span>
            </div>
          </>,
        },
        {
          className: 'hw-end',
          children: <>
            <HumanizeWordIcon className="hw-watermark" />
            <HumanizeWordLogo className="hw-brand ad-in" style={at(80)} />
            <p className="hw-serif hw-end-title">
              <span className="ad-line"><span style={at(240)}>{t('endLine1')}</span></span>
              <span className="ad-line hw-lime"><span style={at(480)}><em>{t('endLine2')}</em></span></span>
            </p>
            <p className="hw-end-body ad-in" style={at(760)}>{t('endBody')}</p>
            <span className="hw-cta ad-sheen" style={at(960)}>{t('cta')}<ArrowRight strokeWidth={2.5} /></span>
            <p className="hw-fine ad-in" style={at(1160)}>{t('fine')}</p>
          </>,
        },
      ]}
    />
  );
}

/** The caption window's level meter: each bar's resting height, and how far it swings. */
const BARS = [0.35, 0.6, 0.45, 0.8, 0.5, 0.9, 0.4, 0.7, 0.55, 0.85, 0.45, 0.65, 0.35, 0.75, 0.5, 0.6, 0.3, 0.45];

function Meter() {
  return <span className="cc-bars">{BARS.map((rest, index) => (
    <i key={index} style={{ '--rest': rest, '--lo': Math.max(0.12, rest - 0.3).toFixed(2), '--hi': Math.min(1, rest + 0.35).toFixed(2), '--dur': `${700 + ((index * 137) % 500)}ms`, '--delay': `-${(index * 211) % 900}ms` } as CSSProperties} />
  ))}</span>;
}

export function CapCueCreative({ still }: { still?: number }) {
  const t = useTranslations('ads.capcue');
  const name = SPONSORED_ADVERTISERS.capcue.name;
  return (
    <AdFrames
      className="ad-creative cc"
      durations={[4600, 5800, 4400]}
      {...(still === undefined ? {} : { still })}
      placeholder={{
        className: 'cc-holder',
        children: <>
          <Image unoptimized className="ad-cover opacity-0" src="/ui/ads/capcue-lecture.webp" alt="" width={720} height={600} />
          <Image unoptimized className="cc-holder-logo" src="/ui/ads/capcue-logo.webp" alt="" width={512} height={126} />
        </>,
      }}
      frames={[
        {
          children: <>
            <Image unoptimized className="ad-cover cc-photo ad-kenburns" src="/ui/ads/capcue-lecture.webp" alt="" width={720} height={600} />
            <div className="cc-shade" />
            <div className="cc-top">
              <span className="cc-pill ad-in" style={at(100)}><Image unoptimized src="/ui/ads/capcue-logo.webp" alt="" width={512} height={126} /></span>
              <span className="cc-live ad-in" style={at(260)}><i className="cc-dot" />{t('live')}</span>
            </div>
            <div className="cc-captions ad-in" style={at(420)}>
              <p className="cc-speaker"><span>{t('speaker')}</span><span>00:12:48</span></p>
              <p className="cc-words"><Typed text={t('caption')} start={800} step={230} /><span className="cc-caret" style={at(800)} /></p>
            </div>
          </>,
        },
        {
          className: 'cc-product',
          children: <>
            <div className="cc-grid" />
            <p className="cc-title">
              <span className="ad-line"><span style={at(80)}>{t('titleLine1')}</span></span>
              <span className="ad-line"><span style={at(220)}>{t.rich('titleLine2', { accent: (chunks) => <span className="cc-grad">{chunks}</span> })}</span></span>
            </p>
            <div className="cc-window ad-in" style={at(460)}>
              <div className="cc-titlebar">
                <Image unoptimized src="/ui/ads/capcue-icon.webp" alt="" width={96} height={96} />{name}
                <span className="cc-rec"><i className="cc-dot" />00:00:14</span>
                <span className="cc-winctl"><Minus /><Square /><X /></span>
              </div>
              <div className="cc-body">
                <div className="cc-meter"><Meter /><span className="cc-latency ad-pop" style={at(2300)}>{t('latency')}</span></div>
                <p className="cc-line cc-s1 ad-in" style={at(1000)}><b>{t('speakerOne')}</b><span>{t('lineOne')}</span></p>
                <p className="cc-line cc-s2 ad-in" style={at(1700)}><b>{t('speakerTwo')}</b><span>{t('lineTwo')}</span></p>
              </div>
            </div>
            <div className="cc-chips">
              {(['meetings', 'lectures', 'streams', 'videos'] as const).map((use, index) => <span key={use} className="cc-chip ad-pop" style={at(2600 + index * 100)}>{t(`uses.${use}`)}</span>)}
            </div>
          </>,
        },
        {
          className: 'cc-end',
          children: <>
            <Image unoptimized className="cc-hex" src="/ui/ads/capcue-icon.webp" alt="" width={96} height={96} />
            <Image unoptimized className="cc-logo ad-in" style={at(80)} src="/ui/ads/capcue-logo.webp" alt="" width={512} height={126} />
            <p className="cc-end-title">
              <span className="ad-line"><span style={at(240)}>{t('endLine1')}</span></span>
              <span className="ad-line"><span style={at(420)}>{t('endLine2')}</span></span>
            </p>
            <p className="cc-end-body ad-in" style={at(700)}>{t('endBody')}</p>
            <span className="cc-cta ad-sheen" style={at(900)}>{t('cta')}<ArrowRight strokeWidth={2.5} /></span>
            <p className="cc-fine ad-in" style={at(1100)}>{t('fine')}</p>
          </>,
        },
      ]}
    />
  );
}
