import { CodeStep } from './code-step';
import type { SignInStepProps } from './step-parts';

export function EmailCodeStep(props: SignInStepProps) {
  return <CodeStep {...props} channel="email" />;
}
