import type { Metadata } from 'next';
import { LegalPageLayout, LegalSection } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy | Supermission',
  description: 'Privacy Policy for the Supermission platform.',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastModified="March 8, 2026">
      <LegalSection number={1} title="Information We Collect">
        <p>
          We collect the following types of information when you use the Supermission platform (&quot;Platform&quot;):
        </p>
        <p><strong>Information You Provide</strong></p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Account information provided through Privy authentication (e.g., email address, social login identifiers)</li>
          <li>Wallet addresses associated with your account</li>
          <li>Communications you send to us (e.g., support requests, feedback)</li>
        </ul>
        <p><strong>Information Collected Automatically</strong></p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Usage data, including pages visited, features used, AI agents interacted with, and trades executed through the Platform</li>
          <li>Device information, including browser type, operating system, device identifiers, and screen resolution</li>
          <li>Log data, including IP addresses, access times, and referring URLs</li>
          <li>Performance and analytics data collected through Vercel Analytics</li>
        </ul>
        <p><strong>Blockchain Data</strong></p>
        <ul className="list-disc pl-6 space-y-2">
          <li>On-chain transaction data associated with your wallet address, which is publicly available on the blockchain</li>
          <li>Position and portfolio data derived from on-chain records</li>
        </ul>
      </LegalSection>

      <LegalSection number={2} title="How We Use Your Information">
        <p>
          We use the information we collect to:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Provide, maintain, and improve the Platform and its features</li>
          <li>Process transactions and manage your wallet and positions</li>
          <li>Power AI agent interactions and deliver personalized analyses</li>
          <li>Communicate with you about your account, updates, and support requests</li>
          <li>Monitor and analyze usage patterns to improve the user experience</li>
          <li>Detect, prevent, and address fraud, abuse, and security issues</li>
          <li>Comply with legal obligations and enforce our Terms of Use</li>
        </ul>
      </LegalSection>

      <LegalSection number={3} title="How We Share Your Information">
        <p>
          We do not sell your personal information. We may share your information with the following parties:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Privy</strong>: our authentication and wallet infrastructure provider, which processes your account credentials and manages custodial wallet keys</li>
          <li><strong>Polymarket</strong>: when you execute trades, your wallet address and transaction data are shared with the Polymarket protocol</li>
          <li><strong>Blockchain networks</strong>: transactions are recorded on public blockchains and are visible to anyone</li>
          <li><strong>AI model providers</strong>: anonymized or aggregated query data may be processed by third-party AI model providers to power agent analyses</li>
          <li><strong>Analytics providers</strong>: we use Vercel Analytics and similar services to understand Platform usage</li>
          <li><strong>Legal and regulatory</strong>: we may disclose information when required by law, subpoena, or regulatory request, or to protect our rights, safety, or property</li>
        </ul>
      </LegalSection>

      <LegalSection number={4} title="Cookies & Tracking">
        <p>
          The Platform uses cookies and similar tracking technologies to:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Maintain your authentication session</li>
          <li>Remember your preferences and settings</li>
          <li>Analyze Platform usage and performance</li>
          <li>Improve the user experience</li>
        </ul>
        <p>
          You can control cookie settings through your browser preferences. However, disabling cookies may affect the functionality of the Platform, including your ability to stay logged in.
        </p>
      </LegalSection>

      <LegalSection number={5} title="Data Security">
        <p>
          We implement reasonable technical and organizational measures to protect your information against unauthorized access, alteration, disclosure, or destruction. These measures include:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Encryption of data in transit using TLS/SSL</li>
          <li>Secure authentication through Privy&apos;s infrastructure</li>
          <li>Access controls limiting who can access user data</li>
          <li>Regular security reviews and monitoring</li>
        </ul>
        <p>
          However, no method of transmission over the internet or method of electronic storage is completely secure. We cannot guarantee the absolute security of your information.
        </p>
      </LegalSection>

      <LegalSection number={6} title="International Transfers">
        <p>
          Your information may be transferred to, stored, and processed in countries other than the country in which you reside. By using the Platform, you consent to the transfer of your information to countries that may have different data protection laws than your country of residence.
        </p>
      </LegalSection>

      <LegalSection number={7} title="Children">
        <p>
          The Platform is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children under 18. If we become aware that we have collected personal information from a child under 18, we will take steps to delete that information promptly.
        </p>
        <p>
          If you are a parent or guardian and believe that your child has provided us with personal information, please contact us at{' '}
          <a href="mailto:divyanshu@supermission.fun" className="text-[#1a1a1a] underline hover:text-black">
            divyanshu@supermission.fun
          </a>.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Your Rights">
        <p>
          Depending on your jurisdiction, you may have certain rights regarding your personal information, including:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Access</strong>: the right to request a copy of the personal information we hold about you</li>
          <li><strong>Correction</strong>: the right to request correction of inaccurate or incomplete information</li>
          <li><strong>Deletion</strong>: the right to request deletion of your personal information, subject to legal and contractual obligations</li>
          <li><strong>Portability</strong>: the right to request your data in a structured, commonly used format</li>
          <li><strong>Objection</strong>: the right to object to certain processing of your information</li>
        </ul>
        <p>
          To exercise any of these rights, please contact us at{' '}
          <a href="mailto:divyanshu@supermission.fun" className="text-[#1a1a1a] underline hover:text-black">
            divyanshu@supermission.fun
          </a>.
          We will respond to your request within a reasonable timeframe.
        </p>
        <p>
          Please note that blockchain transactions are permanent and cannot be deleted. Wallet addresses and transaction records on public blockchains are outside our control.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. Changes will be effective immediately upon posting to the Platform. Your continued use of the Platform after any changes constitutes your acceptance of the revised policy.
        </p>
        <p>
          For material changes, we will make reasonable efforts to notify you through the Platform or via other communication channels associated with your account. We encourage you to review this policy periodically.
        </p>
      </LegalSection>

      <LegalSection number={10} title="Contact">
        <p>
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </p>
        <p>
          <a href="mailto:divyanshu@supermission.fun" className="text-[#1a1a1a] underline hover:text-black">
            divyanshu@supermission.fun
          </a>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
