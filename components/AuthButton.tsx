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
        <button
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90"
          type="submit"
        >
          Sign in
        </button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        'use server';
        await signOut();
      }}
      className="flex items-center gap-2"
    >
      {session.user.email ? (
        <span className="hidden text-xs text-subtle sm:inline">{session.user.email}</span>
      ) : null}
      <button
        className="rounded-md border border-line px-3 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-fg"
        type="submit"
      >
        Sign out
      </button>
    </form>
  );
}
