"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";
import { Pagination, Autoplay } from "swiper/modules";
import { useEffect, useState } from "react";

export default function Hero() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 150);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden py-24 px-6 text-center bg-gradient-to-b from-background to-muted/50">
      {/* Background Glass + Gradient Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent blur-3xl opacity-40 pointer-events-none" />
      <div className="absolute inset-0 backdrop-blur-xl bg-white/5 dark:bg-black/10 pointer-events-none" />

      {/* Main Hero Content */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="z-10 max-w-3xl"
      >
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 text-foreground">
          Build Smarter with{" "}
          <span className="text-primary drop-shadow-sm">FingUI</span>
        </h1>

        <p className="text-muted-foreground text-lg md:text-xl mb-10">
          Sleek, consistent, and powerful UI components — crafted for modern
          web experiences.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="rounded-full font-medium transition-transform hover:scale-105"
          >
            Get Started <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full backdrop-blur-sm bg-background/60 transition-transform hover:scale-105"
          >
            View Docs
          </Button>
        </div>
      </motion.div>

      {/* Swiper Carousel Section */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
        className="mt-16 w-full max-w-4xl"
      >
        <Swiper
          modules={[Pagination, Autoplay]}
          pagination={{ clickable: true }}
          autoplay={{ delay: 3500, disableOnInteraction: false }}
          loop
          className="rounded-3xl shadow-lg"
        >
          <SwiperSlide>
            <Image
              src="/assets/hero-slide1.png"
              alt="FingUI Dashboard Preview"
              width={1200}
              height={600}
              className="rounded-3xl object-cover"
            />
          </SwiperSlide>
          <SwiperSlide>
            <Image
              src="/assets/hero-slide2.png"
              alt="FingUI Components"
              width={1200}
              height={600}
              className="rounded-3xl object-cover"
            />
          </SwiperSlide>
          <SwiperSlide>
            <Image
              src="/assets/hero-slide3.png"
              alt="FingUI Integration"
              width={1200}
              height={600}
              className="rounded-3xl object-cover"
            />
          </SwiperSlide>
        </Swiper>
      </motion.div>

      {/* Scroll-to-top Button */}
      {show && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 bg-primary text-white rounded-full p-3 shadow-md hover:scale-110 transition-transform z-50"
        >
          <ArrowRight className="rotate-[-90deg]" />
        </motion.button>
      )}
    </section>
  );
}
