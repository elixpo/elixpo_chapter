import '../styles/stats/stats.css';


export default function StatsPage() {
  return (
   <div className="container absolute flex flex-col h-full max-w-[2560px] bg-[#030712] box-border">
        <section className="w-full h-[60px]">
            <div className="relative top-0 left-0 w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-[1000]">
                <div className="absolute left-[3%] h-10 w-10 rounded-full bg-[url('/CSS/IMAGES/logo.png')] bg-cover"></div>
                <p className="absolute left-[5%] text-3xl font-bold font-[Kanit,serif] text-white cursor-pointer">LixBlogs</p>
                <div className="absolute left-[80%] text-white text-[1.3em] cursor-pointer px-2.5 py-1.5 bg-[#10141E] border border-[#7ba8f0] rounded-[15px] flex items-center">
                    <ion-icon name="pencil" className="text-[0.8em] mr-1 text-[#7ba8f0]"></ion-icon>
                    Write
                </div>
                <div className="absolute left-[88%] text-white text-[1.3em] cursor-pointer">Sign-In</div>
                <ion-icon name="logo-github" className="githubLogo absolute left-[95%] text-[#888] text-2xl"></ion-icon>
            </div>
        </section>
        <div className="settingsSection flex flex-row h-full w-full h-full box-border">

        <section className="relative flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
            <div className="profileInformation w-[20%] h-full bg-[#10141E] px-5 box-border flex flex-col items-center">
                <div className="profileControlButtons flex-col w-full mt-5 py-10 box-border">
                    <div className="controlButton selected relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 box-border cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
                        <ion-icon name="home-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Home</p>
                    </div>
                <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
                        <ion-icon name="bookmark-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Library</p>
                    </div>
                    <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-15 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
                        <ion-icon name="person-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Profile</p>
                    </div>


                    <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mt-20 mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
                        <ion-icon name="book-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Stories</p>
                    </div>
                    <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
                        <ion-icon name="stats-chart-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Stats</p>
                    </div>


                    <div className="userInfo flex items-center gap-2 w-full h-[50px] px-3 rounded-[12px] bg-[#10141E] shadow-[6px_6px_12px_#0b0e16,-6px_-6px_12px_#171c28]">
                        <div className="userLogo flex-shrink-0 h-[35px] w-[35px] rounded-full bg-[#888] shadow-[inset_3px_3px_6px_#777,inset_-3px_-3px_6px_#999]"></div>
                        <span className="text-white text-lg font-medium cursor-pointer userOrganization truncate">Ayushman Bhattacharya</span>
                    </div>

                </div>
            </div>

            <div className="statsControl w-[80%] h-full max-h-[calc(100vh-80px)] overflow-y-auto bg-[#030712] px-10 box-border flex flex-col items-start">
                <div className="statsHeader w-full h-[30%] flex flex-row items-center ">
                    <h1 className="text-white text-[4em] my-auto font-bold">Stats</h1>
                </div>

                <div className="statsNav flex flex-row w-full h-[10%] items-center justify-left gap-10 mt-2 border-b-2 border-[#1D202A]">
                    <p className="statsNavItem text-[#888] text-lg selected underline cursor-pointer select-none">Posts</p>
                    <p className="statsNavItem text-[#888] text-lg cursor-pointer select-none">Viewers</p>
                </div>



                <div className="statsOverview flex flex-col w-full mt-10 gap-5">

                    <div className="statsBox flex flex-row justify-between w-full px-10">
                        <div className="flex flex-col w-1/2">
                        <p className="text-white text-lg select-none">This Month</p>
                        <p className="text-[#888] text-[1em] select-none">From the 1st August to the 31st August</p>
                        </div>
                        <div className="flex w-1/2">
                            <div className="relative w-full max-w-xs"></div>
                                <div className="relative w-full">
                                    <div id="customMonthDropdown" className="flex items-center justify-between bg-[#10141E] border border-[#7ba8f0] text-white py-2 px-4 pr-8 rounded-[12px] cursor-pointer select-none transition-all duration-300">
                                        <span id="selectedMonth">August</span>
                                        <ion-icon name="chevron-down-outline" className="text-xl text-[#7ba8f0]"></ion-icon>
                                    </div>
                                    <div id="monthOptions" className="monthOptions absolute left-0 right-0 mt-2 bg-[#10141E] max-h-[200px] overflow-y-auto border border-[#7ba8f0] rounded-[12px] shadow-lg z-10 hidden">
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">January</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">February</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">March</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">April</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">May</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">June</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">July</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] selected hover:text-[#7ba8f0] cursor-pointer">August</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">September</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">October</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">November</div>
                                        <div className="relative px-4 py-2 hover:bg-[#313647] text-[#888] hover:text-[#7ba8f0] cursor-pointer">December</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="statsBox flex flex-row gap-5 justify-start items-center">
                            <div className="viewCount flex flex-col px-10">
                                <p className="views text-[4em] font-bold text-white">0</p>
                                <p className="text-[#888] text-[1em] select-none">Views</p>
                            </div>
                            <div className="readCount flex flex-col px-10">
                                <p className="reads text-[4em] font-bold text-white">0</p>
                                <p className="text-[#888] text-[1em] select-none">Reads</p>
                            </div>
                        </div>


                        <div className="statsBox w-full flex flex-col items-center mt-8">
                            <canvas id="readsViewsChart" className="w-full h-80 bg-[#10141E] rounded-[16px] p-4"></canvas>
                        </div>
                    </div>

                </div>
            </section>
        </div>
    </div>
  );
}
