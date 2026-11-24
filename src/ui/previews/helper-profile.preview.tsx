import { routes, type HelperContactAccess, type HelperContactReveal, type HelperProfilePageData, type PreviewEntry } from '@/contracts';
import { helperContactLockedAccess, helperContactRevealAccess, helperContactRevealData, jordanProfilePageData, jordanProfileWithSlotsData, leeProfilePageData, publicViewer, samProfilePageData, samProfilePhoto, samProfileWithAnswersData } from '@/fixtures';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/helperProfile.json';

/** "Show" in the previews: Jordan's details after a moment. */
const revealContact = async (): Promise<HelperContactReveal> => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return helperContactRevealData;
};

function profile(id: string, title: string, data: HelperProfilePageData, contact?: { access: HelperContactAccess; revealed?: HelperContactReveal }): PreviewEntry {
  return {
    id,
    title,
    group: copy.preview.group,
    layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.helperProfile(data.helper.handle)}>
      <HelperProfileScreen data={data} {...(contact ? { contact: contact.access, onRevealContact: revealContact, ...(contact.revealed ? { initialContactReveal: contact.revealed } : {}) } : {})} />
    </PublicShell>,
  };
}

export const helperProfilePreviews: PreviewEntry[] = [
  profile('screen-helper-profile/with-slots', copy.preview.withSlots, jordanProfileWithSlotsData),
  profile('screen-helper-profile/sam', copy.preview.sam, samProfilePageData),
  profile('screen-helper-profile/sam-photo', copy.preview.samPhoto, { ...samProfilePageData, helper: { ...samProfilePageData.helper, photo: samProfilePhoto } }),
  profile('screen-helper-profile/jordan-new', copy.preview.jordanNew, jordanProfilePageData),
  profile('screen-helper-profile/lee-remote', copy.preview.leeRemote, leeProfilePageData),
  profile('screen-helper-profile/contact-reveal', copy.preview.contactReveal, jordanProfileWithSlotsData, { access: helperContactRevealAccess }),
  profile('screen-helper-profile/contact-revealed', copy.preview.contactRevealed, jordanProfileWithSlotsData, { access: helperContactRevealAccess, revealed: helperContactRevealData }),
  profile('screen-helper-profile/contact-locked', copy.preview.contactLocked, jordanProfileWithSlotsData, { access: helperContactLockedAccess }),
  // "Helped 4 neighbors on Neighbors" and their answers (2026-11-24).
  profile('screen-helper-profile/answers', copy.preview.answers, samProfileWithAnswersData),
];
