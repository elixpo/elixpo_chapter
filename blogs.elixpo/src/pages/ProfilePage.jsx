import '../styles/profile/profile.css';
import '../styles/skeletonLoader.css';

export default function ProfilePage() {
  return (
    <div className="container flex flex-col min-h-screen max-w-[2560px] bg-[#030712] box-border">
      {/* Header */}
      <section className="w-full h-[60px]">
        <div className="relative w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-[1000]">
          <div className="absolute left-[3%] h-10 w-10 rounded-full bg-[url('../../CSS/IMAGES/logo.png')] bg-cover"></div>
          <p className="absolute left-[5%] text-3xl font-bold font-[Kanit,serif] text-white cursor-pointer">LixBlogs</p>
          <div className="absolute left-[80%] text-white text-[1.3em] cursor-pointer px-2.5 py-1.5 bg-[#10141E] border border-[#7ba8f0] rounded-[15px] flex items-center">
            <span className="mr-1 text-[#7ba8f0]">
              <ion-icon name="pencil"></ion-icon>
            </span>
            Write
          </div>
          <div className="absolute left-[88%] text-white text-[1.3em] cursor-pointer">Sign-In</div>
          <span className="absolute left-[95%] text-[#888] text-2xl">
            <ion-icon name="logo-github"></ion-icon>
          </span>
        </div>
      </section>

      {/* Main Section */}
      <div className="flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
        {/* Sidebar */}
        <div className="w-[20%] h-full bg-[#10141E] px-5 box-border flex flex-col items-center">
          <div className="flex-col w-full mt-5 py-10 box-border">
            <div className="relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 box-border cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300 selected">
              <span className="text-[#7ba8f0] text-[0.9em]">
                <ion-icon name="home-outline"></ion-icon>
              </span>
              <p className="text-[#7ba8f0] text-[0.9em]">Home</p>
            </div>
            <div className="relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
              <span className="text-[#7ba8f0] text-[0.9em]">
                <ion-icon name="bookmark-outline"></ion-icon>
              </span>
              <p className="text-[#7ba8f0] text-[0.9em]">Library</p>
            </div>
            <div className="relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-15 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300 highlighted">
              <span className="text-[#7ba8f0] text-[0.9em]">
                <ion-icon name="person-outline"></ion-icon>
              </span>
              <p className="text-[#7ba8f0] text-[0.9em]">Profile</p>
            </div>
            <div className="relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mt-20 mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
              <span className="text-[#7ba8f0] text-[0.9em]">
                <ion-icon name="book-outline"></ion-icon>
              </span>
              <p className="text-[#7ba8f0] text-[0.9em]">Stories</p>
            </div>
            <div className="relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-white transition-all duration-300">
              <span className="text-[#7ba8f0] text-[0.9em]">
                <ion-icon name="stats-chart-outline"></ion-icon>
              </span>
              <p className="text-[#7ba8f0] text-[0.9em]">Stats</p>
            </div>
            <div className="flex items-center gap-2 w-full h-[50px] px-3 rounded-[12px] bg-[#10141E] shadow-[6px_6px_12px_#0b0e16,-6px_-6px_12px_#171c28]">
              <div className="flex-shrink-0 h-[35px] w-[35px] rounded-full bg-[#888] skeleton"></div>
              <span className="text-white text-lg font-medium cursor-pointer userOrganization truncate min-h-[30px] min-w-[90%] skeleton"></span>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="w-[80%] h-full bg-[#10141E] px-10 box-border flex flex-col">
          <div className="w-full h-full max-h-[calc(85%)] overflow-y-auto mt-5">
            <div className="relative w-full h-[200px] box-border flex items-center justify-center">
              <div className="h-[200px] w-full bg-[url('../../CSS/IMAGES/SAMPLE_PICS/img_two.jpg')] bg-cover bg-center rounded-[12px] skeleton"></div>
              <div className="absolute left-[5%] top-[50%] h-[170px] w-[170px] bg-[url('../../CSS/IMAGES/SAMPLE_PICS/img_three.jpg')] bg-cover bg-center rounded-full border-[6px] border-[#10141E] skeleton"></div>
            </div>
            <div className="flex flex-row mt-10 gap-5 items-center justify-between">
              <div className="w-1/2 py-5 flex flex-row gap-5 items-center justify-start">
                <p className="text-white text-[2em] font-bold mt-5 min-h-[40px] min-w-[250px] skeleton"></p>
                <p className="text-[#888] text-[1.2em] font-medium mt-5"></p>
              </div>
              <div className="w-1/2 py-5 flex flex-row gap-5 items-center justify-end px-5">
                <div className="bg-[#888] bg-cover bg-center rounded-[8px] h-[40px] w-[40px] hidden"></div>
                <p className="text-white text-[1.2em] font-medium underline select-none cursor-pointer hidden">Elixpo Organization</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[#deeae3] text-[1em] font-medium min-h-[80px] min-w-[10px] skeleton"></p>
              <div className="flex flex-row gap-5 items-center">
                <p className="text-[#888] text-[1em] font-medium">Followers: 0</p>
                <div className="h-[90%] w-[2px] bg-[#888]"></div>
                <p className="text-[#888] text-[1em] font-medium">Following: 0</p>
              </div>
            </div>
            <div className="h-[1px] w-[85%] my-8 mx-auto" style={{background: "linear-gradient(to right, transparent, #0983a5 40%, #0983a5 60%, transparent)"}}></div>
            {/* Blog Showcase */}
            <div className="flex flex-row gap-5 flex-wrap px-10 box-border hidden">
              {/* Example Blog Card */}
              <div className="relative shrink-0 flex flex-col w-[80%] h-[250px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mb-5">
                <div className="flex flex-row gap-2 w-full h-[30px]">
                  <div className="h-[25px] w-[25px] rounded-[8px] bg-[#888]"></div>
                  <span className="text-[#fff] underline cursor-pointer">Elixpo Organization</span>
                  <span className="text-[#888]">by</span>
                  <span className="text-[#fff] cursor-pointer">John Doe</span>
                </div>
                <div className="flex flex-row w-full gap-2">
                  <div className="flex flex-col gap-1 w-[75%] box-border">
                    <p className="text-[#fff] text-[2em] font-extrabold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                    <p className="text-[#888] text-[1em]">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum.</p>
                  </div>
                  <div className="w-[25%] h-[90%] bg-[#888] rounded-[8px]"></div>
                </div>
                <div className="w-full flex flex-row mt-5 gap-5 justify-between">
                  <div className="w-[50%] flex flex-row gap-5">
                    <p className="text-[#888] text-[1em]">Aug 10</p>
                    <p className="text-[#888] text-[1em] flex-row items-center">
                      <ion-icon name="heart"></ion-icon> 1.2K views
                    </p>
                    <p className="text-[#888] text-[1em] flex-row items-center">
                      <ion-icon name="chatbubble"></ion-icon> 0
                    </p>
                  </div>
                  <div className="w-[50%] flex flex-row gap-5 justify-end">
                    <ion-icon name="pencil" class="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0] transition-all duration-300"></ion-icon>
                    <ion-icon name="remove-circle-outline" class="text-[red] text-[1.3em] cursor-pointer hover:text-[#f78080] transition-all duration-300"></ion-icon>
                  </div>
                </div>
              </div>
              {/* Repeat blog cards as needed */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
