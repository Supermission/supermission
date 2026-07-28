'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const ease = [0.16, 1, 0.3, 1] as const;

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  avatar: string;
  quoteMark: string;
  rotation: number;
}

const testimonials: Testimonial[] = [
  {
    quote: 'Prediction Market agent found an arbitrage opportunity I completely missed. The ROI on that single trade paid for the service 10x over.',
    author: 'JESSICA L',
    role: 'Defi Trader',
    avatar: '/landing/avatar-jessica.png',
    quoteMark: '/landing/quote-mark-1.svg',
    rotation: 0,
  },
  {
    quote: 'The Token Due Diligence agent saved me from a potential rug pull. Detailed analysis of the contract and holder distribution was spot on.',
    author: 'MIKE R',
    role: 'Crypto Investor',
    avatar: '/landing/avatar-mike.png',
    quoteMark: '/landing/quote-mark-2.svg',
    rotation: 11.05,
  },
  {
    quote: 'The deep dive into the tokenomics revealed a hidden inflation mechanism. Best due diligence tool I have used.',
    author: 'DAVID K',
    role: 'VC Analyst',
    avatar: '/landing/avatar-david.png',
    quoteMark: '/landing/quote-mark-3.svg',
    rotation: -7.49,
  },
];

function TestimonialCard({ testimonial, offset }: { testimonial: Testimonial; offset: number }) {
  return (
    <motion.div
      className="absolute w-full"
      animate={{
        y: offset * 12,
        scale: 1 - offset * 0.04,
        opacity: 1 - offset * 0.2,
        rotateZ: offset === 0 ? testimonial.rotation : testimonial.rotation + offset * -1.5,
      }}
      transition={{ duration: 0.5, ease }}
      style={{ zIndex: 10 - offset }}
    >
      <div data-landing-testimonial-card className="bg-white rounded-[12.25px] shadow-[0px_0px_6.125px_0px_rgba(0,0,0,0.25)] px-5 sm:px-[41.6px] py-[25.6px] max-w-[470px] mx-auto overflow-visible relative">
        {/* Pin / tape element */}
        <div
          className="absolute z-10 flex items-center justify-center"
          style={{
            left: '50%',
            top: -80,
            width: 99.433,
            height: 159.387,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="rotate-[-17.57deg]" style={{ width: 57.09, height: 149.11 }}>
            <Image
              src="/landing/testimonial-pin.svg"
              alt=""
              className="block max-w-none size-full"
              style={{ margin: '-3.72% -4.85%', width: '109.7%', height: '103.72%' }}
              width={63}
              height={155}
            />
          </div>
        </div>
        {/* Quote mark image */}
        <div className="mb-5">
          <Image data-landing-quote-mark src={testimonial.quoteMark} alt="" className="w-9 h-9" width={36} height={36} />
        </div>

        {/* Quote text */}
        <p className="text-[20.8px] text-[#3a3a3a] leading-[1.5] tracking-[0.052px] mb-14">
          {testimonial.quote}
        </p>

        {/* Author info */}
        <div className="flex items-center gap-[14.7px]">
          <Image
            src={testimonial.avatar}
            alt={testimonial.author}
            className="w-[51.45px] h-[51.45px] rounded-full object-cover"
            width={52}
            height={52}
          />
          <div className="leading-[1.5]">
            <p className="text-[19.2px] font-semibold text-[#3a3a3a] tracking-[0.048px]">{testimonial.author}</p>
            <p className="text-[14.4px] text-[#737373] tracking-[0.036px]">{testimonial.role}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SocialProof() {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Top row: centered badge + heading, with page indicators at right */}
          <div className="relative mb-12 sm:mb-16">
            {/* Centered heading */}
            <div className="flex flex-col items-center gap-1">
              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-[32px] sm:text-[48px] md:text-[64px] font-bold text-[#3a3a3a] tracking-[-1.28px] leading-[1.2] text-center capitalize"
              >
                TRUSTED BY USERS<br />BACKED BY RESULTS
              </motion.h2>
            </div>

            {/* Page indicators - positioned at top right */}
            <div className="flex items-center gap-1 sm:absolute sm:right-0 sm:top-[16px] justify-center sm:justify-end mt-4 sm:mt-0">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  data-landing-testimonial-nav
                  data-active={i === activeIndex ? 'true' : 'false'}
                  onClick={() => setActiveIndex(i)}
                  className={`w-[42px] h-[42px] sm:w-[42px] sm:h-[42px] rounded-[6px] flex items-center justify-center transition-all duration-200 ${
                    i === activeIndex
                      ? 'bg-[#3a3a3a] text-white'
                      : 'text-[#3a3a3a] hover:bg-[#f1f3f4]'
                  }`}
                >
                  <span className="text-[28px] sm:text-[36px] font-bold leading-none tracking-[-1.44px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {i + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Stacked cards */}
          <div className="relative h-[420px] sm:h-[340px] mt-20 sm:mt-0">
            <AnimatePresence mode="popLayout">
              {testimonials.map((testimonial, i) => {
                const offset = (i - activeIndex + testimonials.length) % testimonials.length;
                return (
                  <TestimonialCard
                    key={testimonial.author}
                    testimonial={testimonial}
                    offset={offset}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
