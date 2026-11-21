import Link from 'next/link';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult } from '@/contracts';
import { routes } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { ActionFailureText } from './connection-aware-text';
import { VerifyIdentityLink } from './verify-identity-link';

export function FormFeedback({ result, successMessage, errorMessage }: { result?: ActionResult; successMessage?: string; errorMessage?: string }) {
  const { formatDateTime, zoneName } = useFormat();
  const t = useTranslations('forms');
  const feedback = useTranslations('feedback');
  const onlyFields = result && !result.ok && result.code === 'validation_failed' && Object.values(result.fieldErrors ?? {}).some((codes) => codes?.length);
  return <div aria-live="polite" aria-atomic="true">
    {result && !onlyFields && <Alert role="status" className={result.ok ? 'border-success/30' : 'border-destructive/30'}>
      {result.ok ? <CircleCheck aria-hidden="true" className="text-success" /> : <CircleAlert aria-hidden="true" className="text-destructive" />}
      <AlertDescription className="text-foreground">
        <p>{result.ok ? successMessage ?? feedback(`success.${result.code}`) : errorMessage ?? <ActionFailureText result={result} text={t.has(`actionErrors.${result.code}`) ? t(`actionErrors.${result.code}`) : feedback(`error.${result.code}`)} offlineText={feedback('error.offline')} signedOutText={feedback('error.signed_out')} signInLabel={feedback('error.signInAgain')} />}</p>
        {!result.ok && result.code === 'rate_limited' && result.retryAt && <p className="tabular-nums">{t('retryAt', { at: formatDateTime(result.retryAt), zone: zoneName })}</p>}
        {!result.ok && result.code === 'identity_required' && <VerifyIdentityLink label={t('verifyIdentity')} />}
        {!result.ok && <Link href={routes.help()} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('getHelp')}</Link>}
      </AlertDescription>
    </Alert>}
  </div>;
}
