'use client';

import { Plus } from 'lucide-react';
import React, { useState } from 'react';


interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCardsProps {
  data: FaqItem[];
}

const FaqCards: React.FC<FaqCardsProps> = ({ data }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // First open by default

  const toggleIndex = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      {data.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={index}
            className="p-6 bg-muted dark:bg-neutral-900 max-w-xl w-full mx-auto flex flex-col mt-10 rounded-2xl border  transition-all duration-500 ease-in-out"
          >
            {/* Question Row */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleIndex(index)}
            >
              <h1
                className="text-muted-foreground dark:text-white text-left  font-semibold text-xl"
                style={{ fontFamily: '', fontWeight: 500 }}
              >
                {faq.question}
              </h1>
              <Plus
                className={`transition-transform duration-300 ${
                  isOpen ? 'rotate-45' : 'rotate-0'
                }`}
               
                size={20}
              />
            </div>

            {/* Answer (Expandable) */}
            <div
              className={`transition-all duration-500 ease-in-out overflow-hidden ${
                isOpen ? 'mt-4 opacity-100 max-h-[500px]' : 'opacity-0 max-h-0'
              }`}
            >
              <p className="text-muted-foreground font-mono dark:text-white text-xs">{faq.answer}</p>
            </div>
          </div>
        );
      })}
    </>
  );
};

export default FaqCards;
