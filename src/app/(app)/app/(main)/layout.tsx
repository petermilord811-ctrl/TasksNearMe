import { SignedInShell } from '../signed-in-shell';

/** Most signed-in pages: the shell with the phone tab bar. */
export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SignedInShell layout="tabs">{children}</SignedInShell>;
}
