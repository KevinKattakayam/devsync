import Link from 'next/link';

export default function BillingPage() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Subscription &amp; billing</h1>
      <p className="text-muted-foreground">
        Subscription and invoice information is unavailable in this interface. No plan, price,
        support entitlement or provider usage is inferred.
      </p>
      <p className="text-sm text-muted-foreground">
        For current AI request allowances, open AI usage in your workspace settings. Request
        reservations are separate from token billing.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex rounded-md px-3 py-2 text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Choose a workspace
      </Link>
    </section>
  );
}
