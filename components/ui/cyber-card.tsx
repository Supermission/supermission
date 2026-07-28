'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface CyberCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
  delay?: number;
}

export function CyberCard({ title, description, icon, className = '', delay = 0 }: CyberCardProps) {
  return (
    <motion.div
      className={`cyber-border bg-white p-6 group ${className}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -5 }}
    >
      {/* Icon container */}
      <div
        className="mb-4 w-12 h-12 border border-[#e5e7eb] rounded-[12px] flex items-center justify-center"
      >
        {icon}
      </div>

      {/* Title */}
      <h3 className="bricolage-grotesque font-semibold text-lg sm:text-xl tracking-tight text-[#3a3a3a] mb-2 transition-all">
        {title}
      </h3>

      {/* Description label */}
      <p className="text-[11px] text-[#6b7280] mb-3 border-l-2 border-[#e5e7eb] pl-2">
        {description.split(' ').slice(0, 3).join(' ')}
      </p>

      {/* Body text */}
      <p className="bricolage-grotesque text-sm leading-relaxed text-[#6b7280]">
        {description}
      </p>

      {/* Hover indicator */}
      <motion.div
        className="mt-4 pt-3 border-t border-[#e5e7eb] flex items-center justify-between"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <span className="text-[11px] text-[#6b7280]">
          LEARN_MORE
        </span>
        <motion.span
          className="font-mono text-sm"
          animate={{ x: [0, 5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          &gt;
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
