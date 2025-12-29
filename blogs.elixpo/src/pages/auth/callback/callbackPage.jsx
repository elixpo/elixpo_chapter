import React, { useEffect, useRef } from "react";

const CallbackPage = () => {
    const progressBarRef = useRef(null);
    const progressTextRef = useRef(null);

    useEffect(() => {
        // Simulate progress bar animation
        let progress = 0;
        const interval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 20, 100);
            if (progressBarRef.current) {
                progressBarRef.current.style.width = `${progress}%`;
            }
            if (progressTextRef.current) {
                progressTextRef.current.textContent = `${Math.round(progress)}%`;
            }
            if (progress >= 100) clearInterval(interval);
        }, 600);

        // Optionally, load external scripts if needed
        // Example: window.tailwind = require('tailwindcss');

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="gradient-bg min-h-screen flex items-center justify-center font-['Inter',sans-serif] p-4">
            <div className="w-full max-w-md mx-auto">
                <div className="text-center mb-8 fade-in flex flex-col">
                    <div className="initSection flex flex-row items-center justify-center space-x-3">
                        <div className="flex justify-center items-center mb-4">
                            <div className="h-16 w-16 rounded-full bg-[url('../../../CSS/IMAGES/logo.png')] bg-cover bg-center"></div>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">LixBlogs</h1>
                    </div>
                    <p className="text-gray-400 text-sm">Completing your authentication</p>
                </div>

                <div className="bg-[#10141E]/80 backdrop-blur-sm border border-[#313647] rounded-2xl p-4 shadow-2xl slide-up">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center space-x-3">
                            <div
                                id="userAvatar"
                                className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7ba8f0] to-[#2563eb] flex items-center justify-center text-white font-semibold text-lg hidden"
                                title="Who am I?"
                            >
                                ?
                            </div>
                            <div id="userInfo" className="hidden">
                                <div id="userName" className="text-white font-medium text-sm">
                                    Loading...
                                </div>
                                <div id="userEmail" className="text-gray-400 text-xs">
                                    Verifying identity
                                </div>
                            </div>
                            <div id="loadingUser" className="flex items-center space-x-3">
                                <div className="w-12 h-12 rounded-full bg-[#1D202A] animate-pulse"></div>
                                <div>
                                    <div className="w-24 h-4 bg-[#1D202A] rounded animate-pulse mb-2"></div>
                                    <div className="w-32 h-3 bg-[#1D202A] rounded animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div id="providerIcon" className="provider-icon"></div>
                        </div>
                    </div>

                    <div className="text-center mb-6">
                        <div id="statusIcon" className="mb-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1D202A] border-2 border-[#7ba8f0]/30">
                                <div className="w-8 h-8 border-2 border-[#7ba8f0] border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        </div>
                        <h2 id="statusTitle" className="text-xl font-semibold text-white mb-2">
                            Authenticating<span className="loading-dots"></span>
                        </h2>
                        <p id="status" className="text-gray-400 text-sm leading-relaxed">
                            Please wait while we verify your credentials and complete the sign-in process.
                        </p>
                    </div>

                    <div className="mb-6">
                        <div className="w-full bg-[#1D202A] rounded-full h-2 overflow-hidden">
                            <div
                                id="progressBar"
                                ref={progressBarRef}
                                className="h-full bg-gradient-to-r from-[#7ba8f0] to-[#2563eb] rounded-full transition-all duration-1000 ease-out w-0"
                            ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <span>Connecting</span>
                            <span id="progressText" ref={progressTextRef}>
                                0%
                            </span>
                            <span>Complete</span>
                        </div>
                    </div>

                    <div id="actionButtons" className="hidden space-y-3">
                        <button
                            id="retryBtn"
                            className="w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02]"
                        >
                            Try Again
                        </button>
                        <button
                            id="backBtn"
                            className="w-full py-3 bg-[#1D202A] hover:bg-[#23395d] text-gray-300 rounded-lg font-medium transition-all duration-200 border border-[#313647]"
                        >
                            Back to Login
                        </button>
                    </div>
                </div>

                <div className="text-center mt-6 fade-in">
                    <p className="text-gray-500 text-xs">
                        Secured by LixBlogs Authentication
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CallbackPage;