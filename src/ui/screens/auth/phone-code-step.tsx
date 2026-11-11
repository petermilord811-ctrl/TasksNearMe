import { CodeStep } from './code-step';
import type { SignInStepProps } from './step-parts';

export function PhoneCodeStep(props: SignInStepProps) {
  return <CodeStep {...props} channel="phone" />;
}
