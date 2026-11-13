import type { PreviewEntry, StaffVerifyPageData } from '@/contracts';
import { fakeStaffVerifyHandlers, staffVerifyCodeData, staffVerifyDevData, staffVerifyEnrollData, staffVerifySetupCodeData } from '@/fixtures';
import { StaffVerifyScreen } from '@/ui/screens/admin/staff-verify-screen';
import copy from '../../../messages/en/ui/staffVerify.json';

const p = copy.previews;

function step(id: string, title: string, data: StaffVerifyPageData): PreviewEntry {
  return { id: `screen-staff-verify/${id}`, group: p.group, title, layout: 'fullscreen', render: () => <StaffVerifyScreen data={data} handlers={fakeStaffVerifyHandlers} /> };
}

export const staffVerifyPreviews: PreviewEntry[] = [
  step('code', p.code, staffVerifyCodeData),
  step('dev', p.dev, staffVerifyDevData),
  step('setup-code', p.setupCode, staffVerifySetupCodeData),
  step('enroll', p.enroll, staffVerifyEnrollData),
];
