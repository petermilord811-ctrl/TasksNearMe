import { routes, type HelperProfilePageData, type PreviewEntry } from '@/contracts';
import { jordanProfilePageData, jordanProfileWithSlotsData, leeProfilePageData, publicViewer, samProfilePageData } from '@/fixtures';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/helperProfile.json';

function profile(id: string, title: string, data: HelperProfilePageData): PreviewEntry {
  return {
    id,
    title,
    group: copy.preview.group,
    layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.helperProfile(data.helper.handle)}><HelperProfileScreen data={data} /></PublicShell>,
  };
}

export const helperProfilePreviews: PreviewEntry[] = [
  profile('screen-helper-profile/with-slots', copy.preview.withSlots, jordanProfileWithSlotsData),
  profile('screen-helper-profile/sam', copy.preview.sam, samProfilePageData),
  profile('screen-helper-profile/jordan-new', copy.preview.jordanNew, jordanProfilePageData),
  profile('screen-helper-profile/lee-remote', copy.preview.leeRemote, leeProfilePageData),
];
