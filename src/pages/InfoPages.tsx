import { Compass } from 'lucide-react';
import { DISCLAIMER } from '../components/common/disclaimer';
import { ButtonLink, Card, EmptyState } from '../components/common/ui';
import { Breadcrumbs, Container, PageHeader } from '../components/layout/Layout';
import { Link } from '../router';

export function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow={<Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Privacy', path: '/privacy' }]} />} title="Privacy" description="NetWorth is built so that your salary never leaves your device." />
      <Container narrow>
        <article className="prose-nw">
          <h2 className="!mt-0">The short version</h2>
          <ul>
            <li>No accounts, no sign-up and no server that stores anything about you.</li>
            <li>No analytics, advertising or tracking scripts, and no cookies.</li>
            <li>Every calculation runs in your browser.</li>
          </ul>

          <h2>What is stored, and where</h2>
          <p>NetWorth uses your browser’s local storage — data that stays on this device and is never sent anywhere. It holds:</p>
          <ul>
            <li>your settings (theme, default country, currency, tax year and number format);</li>
            <li>calculations you choose to save, and the offers on the comparison page;</li>
            <li>the most recent exchange rates, so the app does not fetch them on every visit.</li>
          </ul>
          <p>
            To make the site work offline, your browser also keeps a copy of the site’s own files. You can delete everything at any time under <Link to="/settings">Settings → Your data</Link>, or by clearing your browser’s site data.
          </p>

          <h2>Network requests</h2>
          <p>
            The only request NetWorth makes while you use it is for exchange rates, to the free <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a> service (European Central Bank data). The request contains only a currency code and, for historical rates, a date — never a salary or anything you typed. Fonts and all other files are served from this site itself.
          </p>
          <p>
            The site is hosted on GitHub Pages. Like any web host, GitHub processes technical data such as IP addresses to deliver pages; see{' '}
            <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">
              GitHub’s privacy statement
            </a>
            .
          </p>

          <h2>Shared links</h2>
          <p>A share link contains the inputs of a calculation — country, salary, frequency, tax year, currency and any circumstances you changed — so that whoever opens it sees the same calculation. It contains no name and no results. Anyone who has the link can see the salary in it, so share it only with people you would tell.</p>

          <h2>Saved data and backups</h2>
          <p>Exported backups are ordinary JSON files that you download and keep. NetWorth never uploads them.</p>
        </article>
      </Container>
    </>
  );
}

export function DisclaimerPage() {
  return (
    <>
      <PageHeader eyebrow={<Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Disclaimer', path: '/disclaimer' }]} />} title="Disclaimer" />
      <Container narrow>
        <article className="prose-nw">
          <Card className="!mt-0 p-5 text-[15px] leading-relaxed text-ink">{DISCLAIMER}</Card>
          <h2>What the figures are</h2>
          <p>NetWorth estimates take-home pay for an employee from the official tax rules of each supported country for the selected tax year. Each result is labelled verified, estimate or incomplete, and lists its assumptions and sources.</p>
          <h2>What they are not</h2>
          <ul>
            <li>Not tax, legal, financial or immigration advice.</li>
            <li>Not a payslip: employers, benefits, bonuses and personal deductions change actual pay.</li>
            <li>Not a guaranteed exchange rate: converted amounts use European Central Bank reference rates; your bank’s rate will differ.</li>
          </ul>
          <h2>Errors</h2>
          <p>
            Tax rules change and mistakes are possible despite testing. Before making decisions, check with the tax authority of the country concerned or a qualified adviser. The <Link to="/methodology">methodology</Link> explains how every number is produced.
          </p>
        </article>
      </Container>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Container narrow className="py-16">
      <h1 className="sr-only">Page not found</h1>
      <Card>
        <EmptyState
          icon={<Compass size={20} />}
          title="This page doesn’t exist"
          action={
            <>
              <ButtonLink to="/" variant="primary">
                Go to the homepage
              </ButtonLink>
              <ButtonLink to="/calculator">Open the calculator</ButtonLink>
            </>
          }
        >
          The link may be old or mistyped.
        </EmptyState>
      </Card>
    </Container>
  );
}
