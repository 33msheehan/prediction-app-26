import { auth, signIn, signOut } from '@/auth';

export async function AuthButton() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form
        action={async () => {
          'use server';
          await signIn('github');
        }}
      >
        <button type="submit">Sign in</button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        'use server';
        await signOut();
      }}
    >
      <button type="submit">
        Sign out{session.user.email ? ` (${session.user.email})` : ''}
      </button>
    </form>
  );
}
