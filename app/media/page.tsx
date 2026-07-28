'use client';

import Image from 'next/image';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';

const assets = [
  {
    name: 'Logo (Dark)',
    description: 'Primary logo for light backgrounds',
    src: '/new.png',
    downloadName: 'supermission-logo-dark.png',
    format: 'PNG',
  },
  {
    name: 'Logo (White)',
    description: 'Logo for dark backgrounds',
    src: '/new-white.png',
    downloadName: 'supermission-logo-white.png',
    format: 'PNG',
  },
  {
    name: 'Logo (SVG)',
    description: 'Vector logo for scalable use',
    src: '/landing/footer-logo.svg',
    downloadName: 'supermission-logo.svg',
    format: 'SVG',
  },
  {
    name: 'Icon',
    description: 'App icon / favicon',
    src: '/icon-512.png',
    downloadName: 'supermission-icon.png',
    format: 'PNG',
  },
];

export default function MediaPage() {
  return (
    <SiteThemeScope>
      <div className="min-h-screen flex flex-col bg-white">
        <Header rightExtra={<SiteThemeToggle />} hideSettings />
        <main className="flex-1 py-16 px-4 sm:px-6 lg:px-8 pt-[96px] sm:pt-[112px]">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-semibold text-[#121212] mb-2">
              Media Kit
            </h1>
            <p className="text-[#3a3a3a] mb-10">
              Download Supermission brand assets for press and media use.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {assets.map((asset) => (
                <div
                  key={asset.name}
                  className="border border-[#e5e7eb] rounded-lg p-6 flex flex-col"
                >
                  <div
                    className={`relative w-full h-32 rounded-md mb-4 flex items-center justify-center ${
                      asset.name.includes('White') ? 'bg-[#1a1a1a]' : 'bg-[#f5f5f5]'
                    }`}
                  >
                    <Image
                      src={asset.src}
                      alt={asset.name}
                      width={120}
                      height={120}
                      className="object-contain max-h-24"
                    />
                  </div>
                  <h3 className="text-base font-medium text-[#121212] mb-1">
                    {asset.name}
                  </h3>
                  <p className="text-sm text-[#3a3a3a] mb-3 flex-1">
                    {asset.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#6b7280] uppercase tracking-wide">
                      {asset.format}
                    </span>
                    <a
                      href={asset.src}
                      download={asset.downloadName}
                      className="text-sm font-medium text-[#121212] hover:underline"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-[#e5e7eb]">
              <h2 className="text-lg font-medium text-[#121212] mb-3">
                Usage Guidelines
              </h2>
              <ul className="text-sm text-[#3a3a3a] space-y-2">
                <li>• Use the dark logo on light backgrounds</li>
                <li>• Use the white logo on dark backgrounds</li>
                <li>• Do not alter, rotate, or distort the logos</li>
                <li>• Maintain adequate spacing around the logo</li>
              </ul>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </SiteThemeScope>
  );
}
