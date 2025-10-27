'use client'
import FlipLink from '@/components/ui/text-effect-flipper'
import { SparklesIcon } from 'lucide-react'
import React from 'react'

const Links = () => {
  const Icons = {
    discord: (props: React.SVGProps<SVGSVGElement>) => (
      <svg
        width="86"
        height="86"
        viewBox="0 0 86 86"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <rect
          width="86"
          height="86"
          rx="14"
          className="fill-[#D9D9D9] transition-all duration-500 ease-in-out group-hover:fill-[#7289DA]"
        />
        <g transform="translate(18,18) scale(2.1)">
          <path
            className="fill-black transition-all duration-500 ease-in-out group-hover:fill-white"
            d="M18.942 5.556a16.299 16.299 0 0 0-4.126-1.297c-.178.321-.385.754-.529 1.097a15.175 15.175 0 0 0-4.573 0 11.583 11.583 0 0 0-.535-1.097 16.274 16.274 0 0 0-4.129 1.3c-2.611 3.946-3.319 7.794-2.965 11.587a16.494 16.494 0 0 0 5.061 2.593 12.65 12.65 0 0 0 1.084-1.785 10.689 10.689 0 0 1-1.707-.831c.143-.106.283-.217.418-.331 3.291 1.539 6.866 1.539 10.118 0 .137.114.277.225.418.331-.541.326-1.114.606-1.71.832a12.52 12.52 0 0 0 1.084 1.785 16.46 16.46 0 0 0 5.064-2.595c.415-4.396-.709-8.209-2.973-11.589zM8.678 14.813c-.988 0-1.798-.922-1.798-2.045s.793-2.047 1.798-2.047 1.815.922 1.798 2.047c.001 1.123-.793 2.045-1.798 2.045zm6.644 0c-.988 0-1.798-.922-1.798-2.045s.793-2.047 1.798-2.047 1.815.922 1.798 2.047c0 1.123-.793 2.045-1.798 2.045z"
          />
        </g>
      </svg>
    ),

    linkedin: (props: React.SVGProps<SVGSVGElement>) => (
      <svg
        width="86"
        height="86"
        viewBox="0 0 86 86"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <rect
          width="86"
          height="86"
          rx="14"
          className="fill-[#D9D9D9] transition-all duration-500 ease-in-out group-hover:fill-[#0A66C2]"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          className="fill-black transition-all duration-500 ease-in-out group-hover:fill-white"
          d="M27.7128 69.5277V33.4109H15.7096V69.5276H27.7128V69.5277ZM21.7125 28.4816C25.8969 28.4816 28.5035 25.7059 28.5035 22.2401C28.4244 18.6973 25.8969 16 21.7909 16C17.6843 16.0001 15 18.6974 15 22.2402C15 25.706 17.6052 28.4817 21.6334 28.4817L21.7125 28.4816ZM34.3561 69.5277C34.3561 69.5277 34.5136 36.7996 34.3561 33.411H46.3612V38.6487H46.2815C47.86 36.184 50.7038 32.5629 57.179 32.5629C65.0788 32.5629 71 37.7249 71 48.8186V69.5278H58.9969V50.2063C58.9969 45.3514 57.2601 42.0385 52.915 42.0385C49.5995 42.0385 47.6236 44.2719 46.7559 46.4309C46.4384 47.1993 46.3612 48.2786 46.3612 49.3581V69.5277H34.3561Z"
        />
      </svg>
    ),

    github: (props: React.SVGProps<SVGSVGElement>) => (
      <svg
        width="86"
        height="86"
        viewBox="0 0 86 86"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <rect
          width="86"
          height="86"
          rx="14"
          className="fill-[#D9D9D9] transition-all duration-500 ease-in-out group-hover:fill-[#bd2c00]"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          className="fill-black transition-all duration-500 ease-in-out group-hover:fill-white"
          d="M43.2908 13C60.0205 13 73.5817 26.9033 73.5817 44.057C73.5817 57.7757 64.9124 69.4135 52.8839 73.524C51.3482 73.8299 50.803 72.86 50.803 72.0331C50.803 71.0093 50.8393 67.6653 50.8393 63.5094C50.8393 60.6136 49.87 58.7236 48.7826 57.7603C55.5283 56.9909 62.6164 54.3645 62.6164 42.4359C62.6164 39.0434 61.4411 36.2749 59.4964 34.1C59.8114 33.3155 60.8504 30.1566 59.1996 25.8795C59.1996 25.8795 56.6612 25.0473 50.8787 29.0639C48.4584 28.3763 45.8655 28.0303 43.2908 28.0182C40.7161 28.0303 38.1262 28.3763 35.709 29.0639C29.9205 25.0473 27.376 25.8795 27.376 25.8795C25.7312 30.1566 26.7702 33.3155 27.0822 34.1C25.1466 36.2749 23.9623 39.0434 23.9623 42.4359C23.9623 54.3342 31.0352 57.0009 37.7628 57.7855C36.8964 58.5609 36.1119 59.9289 35.8393 61.9371C34.1127 62.7308 29.7266 64.1043 27.0246 59.3577C27.0246 59.3577 25.4223 56.3736 22.3811 56.1556C22.3811 56.1556 19.4277 56.1163 22.1751 58.0428C22.1751 58.0428 24.1591 58.997 25.5374 62.5864C25.5374 62.5864 27.3155 68.1295 35.7424 66.2515C35.7575 68.8474 35.7848 71.294 35.7848 72.0331C35.7848 72.854 35.2274 73.8147 33.7159 73.5269C21.6783 69.4225 13 57.7787 13 44.057C13 26.9033 26.5642 13 43.2908 13Z"
        />
      </svg>
    ),

    instagram: (props: React.SVGProps<SVGSVGElement>) => (
      <svg
        width="86"
        height="86"
        viewBox="0 0 86 86"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <defs>
          <linearGradient id="insta-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#feda75" />
            <stop offset="25%" stopColor="#fa7e1e" />
            <stop offset="50%" stopColor="#d62976" />
            <stop offset="75%" stopColor="#962fbf" />
            <stop offset="100%" stopColor="#4f5bd5" />
          </linearGradient>
        </defs>
        <rect
          width="86"
          height="86"
          rx="14"
          className="fill-[#D9D9D9] transition-all duration-500 ease-in-out group-hover:fill-[url(#insta-gradient)]"
        />
        <g transform="translate(-5,-5) scale(1.9)">
          <path
            className="fill-black transition-all duration-500 ease-in-out group-hover:fill-white"
            d="M25 12c-3.53 0-3.973.015-5.36.078-1.384.063-2.329.283-3.156.604a6.372 6.372 0 0 0-2.302 1.5 6.372 6.372 0 0 0-1.5 2.303c-.321.826-.54 1.771-.604 3.155C12.015 21.027 12 21.47 12 25c0 3.53.015 3.973.078 5.36.063 1.384.283 2.329.604 3.155.333.855.777 1.58 1.5 2.303a6.372 6.372 0 0 0 2.302 1.5c.827.32 1.772.54 3.156.604 1.387.063 1.83.078 5.36.078 3.53 0 3.973-.015 5.36-.078 1.384-.063 2.329-.283 3.155-.604a6.371 6.371 0 0 0 2.303-1.5 6.372 6.372 0 0 0 1.5-2.303c.32-.826.54-1.771.604-3.155.063-1.387.078-1.83.078-5.36 0-3.53-.015-3.973-.078-5.36-.063-1.384-.283-2.329-.605-3.155a6.372 6.372 0 0 0-1.499-2.303 6.371 6.371 0 0 0-2.303-1.5c-.826-.32-1.771-.54-3.155-.604C28.973 12.015 28.53 12 25 12m0 2.342c3.471 0 3.882.014 5.253.076 1.267.058 1.956.27 2.414.448.607.236 1.04.517 1.495.972.455.455.736.888.972 1.495.178.458.39 1.146.448 2.414.062 1.37.076 1.782.076 5.253s-.014 3.882-.076 5.253c-.058 1.268-.27 1.956-.448 2.414a4.028 4.028 0 0 1-.972 1.495 4.027 4.027 0 0 1-1.495.972c-.458.178-1.147.39-2.414.448-1.37.062-1.782.076-5.253.076s-3.883-.014-5.253-.076c-1.268-.058-1.956-.27-2.414-.448a4.027 4.027 0 0 1-1.495-.972 4.03 4.03 0 0 1-.972-1.495c-.178-.458-.39-1.146-.448-2.414-.062-1.37-.076-1.782-.076-5.253s.014-3.882.076-5.253c.058-1.268.27-1.956.448-2.414.236-.607.517-1.04.972-1.495a4.028 4.028 0 0 1 1.495-.972c.458-.178 1.146-.39 2.414-.448 1.37-.062 1.782-.076 5.253-.076"
          />
          <path
            className="fill-black transition-all duration-500 ease-in-out group-hover:fill-white"
            d="M25 18a7 7 0 1 0 0 14 7 7 0 0 0 0-14m0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9m8.7-11.4a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0"
          />
        </g>
      </svg>
    ),
  }

  return (
    <section className="relative py-20 overflow-x-clip">
      <div className="container mx-auto">
        <div className="flex flex-col items-center gap-y-5">
          <div className="flex items-center gap-2 rounded-2xl font-mono border px-4 py-1">
            <SparklesIcon className="fill-[#EEBDE0] stroke-1 text-neutral-800" />
            <span>Hover Over Links</span>
          </div>

          <div className="flex flex-col items-center">
            <span
             
              className="text-4xl font-[poppins] capitalize text-center md:text-6xl font-black"
            >
              Minds behind the,{' '}
              <span className="dark:text-amber-200 text-amber-300">FingUI.</span>
            </span>
            <p className="font-mono text-xs md:text-lg text-center mt-1">
              Connect with us across the platforms that matter.
            </p>
          </div>

          <div className="flex flex-col items-center">
            <section className="grid place-content-center gap-2 px-8 py-10 text-black">
              <div className="group flex items-center justify-center">
                <Icons.linkedin />
                <FlipLink href="https://www.linkedin.com/in/subhro-kolay-05952328a/">Linkedin</FlipLink>
              </div>
              <div className="group flex items-center justify-center">
                <FlipLink href="https://discord.gg/rNChHMcGdG">Discord</FlipLink>
                <Icons.discord />
              </div>
              <div className="group flex items-center justify-center">
                <Icons.github />
                <FlipLink href="https://github.com/IgYaHiko">Github</FlipLink>
              </div>
              <div className="group flex items-center justify-center">
                <FlipLink href="https://www.instagram.com/_mojo_rojo/">Instagram</FlipLink>
                <Icons.instagram />
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Links
