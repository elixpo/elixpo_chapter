import './App.css';
import './styles/homepage/header.css'
import './styles/homepage/innerLayout.css'
import './styles/homepage/innerLayoutPseudo.css'
import './styles/homepage/responsive.css'
export default function App() {
  return (
    <>
   <div className="fixed top-0 left-0 w-full h-16 border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-1000">
        <div className="absolute left-3 h-10 w-10 rounded-full bg-cover" style={{backgroundImage: "url(../IMAGES/logo.png)"}}></div>
        <p className="absolute left-[5%] text-3xl font-bold font-kanit text-white cursor-pointer">LixBlogs</p>

        <div className="absolute left-[70%] text-white text-lg cursor-pointer px-2 py-1 bg-[#10141E] border border-[#7ba8f0] rounded-2xl"> <ion-icon name="pencil"></ion-icon> Write</div>
        <div className="absolute left-[78%] text-white text-lg cursor-pointer">Sign-In</div>
        <button className="absolute left-[85%] cursor-pointer font-medium text-sm rounded-full text-white bg-gradient-to-b from-[#8d49fd] via-[#7f56f3] to-[#5691f3] px-6 py-3 getStartedBtn">
            <span>Get started</span>
        </button>
        <ion-icon name="logo-github" className="absolute left-[95%] text-[#888] text-2xl"></ion-icon>
    </div>
    <div className="absolute top-0 left-0 h-full w-full overflow-x-hidden overflow-y-auto bg-[#030712]" id="container">


        <div className="relative top-16 w-full h-auto bg-transparent overflow-hidden">
            <div className="relative top-0 h-[90px] w-full bg-transparent border-b-[5px] border-b-[#1D202A] border-l border-l-[#1D202A] border-r border-r-[#1D202A] section-striped">
                <div className="absolute top-[80%] left-[4%] transform -translate-y-1/2 font-kanit text-sm text-[#c6c0c091] z-10">console.log("A place to read write and enjoy the creative aspect");</div>
            </div>
            <div className="relative top-0 h-[250px] w-full bg-transparent border-b-[5px] border-b-[#1D202A] border-l border-l-[#1D202A] border-r border-r-[#1D202A] overflow-hidden flex-wrap z-10 section-striped">
                <p className="absolute top-[20%] left-[4%] w-[90%] transform -translate-y-1/2 font-kanit text-5xl font-medium text-[#f4eaeae6] z-10">Write Read and Endulge into creativity, enjoy the power of AI and Imagination.</p>
                <div className="absolute left-[90%] h-full aspect-square transform scale-150 overflow-hidden bg-cover opacity-50 z-0" style={{backgroundImage: "url(../IMAGES/mainframeDesign.png)"}}></div>
            </div>
            <div className="relative top-0 h-[100px] w-full bg-transparent border-b border-b-[#1D202A] border-l border-l-[#1D202A] border-r border-r-[#1D202A] overflow-hidden flex-wrap" style={{backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.171) 2px, transparent 0)", backgroundSize: "30px 30px", backgroundPosition: "-5px -5px"}}>
                <div className="absolute left-[35%] top-1/2 transform -translate-y-1/2 scale-125 border-none outline-none bg-[#3a3a3a] w-[120px] h-10 text-lg text-white font-semibold rounded-2xl flex justify-center items-center cursor-pointer transition-all readBlogsBtn">
                    <span className="block px-1.5 py-1.5 rounded-2xl overflow-hidden relative bg-gradient-to-b from-[#e9d1ff] to-transparent bg-no-repeat z-0 font-kanit font-medium text-base">{`>`} Read Blogs</span>
                    <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[106%] h-[130%] overflow-hidden rounded-2xl will-change-transform z-[-2] blur-[10px] transition-all">
                        <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[105%] aspect-square rounded-3xl transition-all bg-gradient-to-r from-cyan-400 to-cyan-300 animate-spin filter blur-[10px]"></span>
                    </span>
                </div>
                <div className="absolute left-[55%] top-1/2 transform -translate-y-1/2 scale-125 border-none outline-none bg-[#3a3a3a] w-[120px] h-10 text-lg text-white font-semibold rounded-2xl flex justify-center items-center cursor-pointer transition-all starGithub">
                    <span className="block px-1.5 py-1.5 rounded-2xl overflow-hidden relative bg-gradient-to-b from-[#e9d1ff] to-transparent bg-no-repeat z-0 font-kanit font-medium text-base">⭐ GitHub Star</span>
                </div>
            </div>

            <div className="relative top-0 h-[450px] w-full bg-transparent border-l border-l-[#1D202A] border-r border-r-[#1D202A] overflow-hidden section-striped">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-full w-[94%] bg-[#1D202A]">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-3xl h-[95%] w-[98%] bg-[#030712] border border-[#616678] overflow-hidden">
                        <ion-icon name="document-outline" className="absolute top-[5%] left-[5%] text-5xl text-white font-medium"></ion-icon>
                        <div className="absolute left-[12%] top-[5%] text-2xl text-white font-kanit">Easy UI For Quick Production</div>
                        <div className="absolute top-[15%] left-[12%] text-[#888] w-[40%] flex-wrap font-kanit">Ultimately, our goal is to deepen our collective understanding of the world through the power of writing.</div>

                        <div className="absolute top-[30%] w-[97%] left-[1.5%] h-full bg-[#030712] border border-[#555] rounded-3xl overflow-x-hidden" style={{backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.171) 1px, transparent 0)", backgroundSize: "10px 10px", backgroundPosition: "-5px -5px"}}>
                            <div className="absolute left-[3%] top-0 bg-[#030712] rounded-2xl overflow-hidden w-[1180px] m-5">
                                <div className="flex justify-between items-center bg-[#030712] p-4">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <span className="w-3 h-3 rounded-full bg-[#353941]"></span>
                                            <span className="w-3 h-3 rounded-full bg-[#353941]"></span>
                                            <span className="w-3 h-3 rounded-full bg-[#353941]"></span>
                                        </div>
                                    </div>
                                </div>
                                <div className="min-h-[280px] bg-[#10141E] w-[99%] left-0.5 relative rounded-2xl">
                                    <div className="relative top-5 left-1/2 transform -translate-x-1/2 w-[90%] h-[50px] flex gap-2 mb-5 pointer-events-none">
                                        <input type="text" placeholder="You know, where you are at!" className="border-none bg-transparent w-[90%] outline-none indent-2.5 text-[#888] placeholder-[#888] text-2xl" /> 
                                    </div>
                                    <div className="relative top-5 left-1/2 transform -translate-x-1/2 w-[90%] h-auto flex gap-2 pointer-events-none">
                                        <ion-icon name="add-circle-outline" className="text-3xl text-[#888]"></ion-icon>
                                        <div className="border-none bg-transparent w-[90%] outline-none indent-2.5 text-[#888] text-lg font-kanit">
                                            Welcome to LixBlogs! Your go-to platform for reading, writing, and indulging
                                            in creativity. Enjoy the power of AI and imagination.
                                            Explore a wide range of topics, from technology to lifestyle, and connect
                                            with a community of like-minded individuals.
                                            Start your journey today and unleash your creative potential with LixBlogs.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative top-0 h-[450px] w-full bg-transparent border-b-[5px] border-b-[#1D202A] border-l border-l-[#1D202A] border-r border-r-[#1D202A] overflow-hidden section-striped">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-full w-[94%] bg-[#1D202A] flex">
                    <div className="absolute top-1/2 left-[1%] transform -translate-y-1/2 rounded-3xl h-[95%] w-[48%] bg-[#030712] border border-[#616678] overflow-hidden">
                        <ion-icon name="chatbox-ellipses-outline" className="absolute top-[5%] left-[5%] text-5xl text-white font-medium"></ion-icon>
                        <div className="absolute left-[12%] top-[5%] text-2xl text-white font-kanit">Quick Elixpo AI Co-pilot </div>
                        <div className="absolute top-[15%] left-[12%] text-[#888] w-[40%] flex-wrap font-kanit">I'm your AI Search Engine, ready to help you with any questions or tasks you have.</div>

                        <div className="absolute top-[20%] w-[90%] left-[5%] h-auto" style={{backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.171) 1px, transparent 0)", backgroundSize: "10px 10px", backgroundPosition: "-5px -5px"}}>
                            <div className="w-full">
                                <input type="text" className="border-none bg-transparent w-full outline-none indent-2.5 text-[#888] placeholder-[#888]" placeholder="Search anything..." value="Starlink Latest Purchase of OpenAI" readOnly spellCheck="false" autoComplete="off" />
                                <div className="flex gap-4 absolute top-[50%] right-[5%] transform -translate-y-1/2">
                                    <ion-icon name="refresh-outline" className="text-[#888]"></ion-icon>
                                </div>
                            </div>

                            <button className="absolute top-[50px] left-[30px] w-12 h-12 rounded-lg border border-[#616678] flex justify-center items-center cursor-pointer text-lg text-[#888] bg-transparent hover:bg-[#1D202A]">
                                <ion-icon name="newspaper-outline"></ion-icon>
                            </button>
                            <button className="absolute top-[50px] left-[90px] w-12 h-12 rounded-lg border border-[#616678] flex justify-center items-center cursor-pointer text-lg text-[#888] bg-transparent hover:bg-[#1D202A]">
                                <ion-icon name="code-outline"></ion-icon>
                            </button>
                            <button className="absolute top-[50px] left-[150px] w-12 h-12 rounded-lg border border-[#616678] flex justify-center items-center cursor-pointer text-lg text-[#888] bg-transparent hover:bg-[#1D202A]">
                                <ion-icon name="reader-outline"></ion-icon>
                            </button>
                            <button className="absolute top-[50px] left-[210px] w-12 h-12 rounded-lg border border-[#616678] flex justify-center items-center cursor-pointer text-lg text-[#888] bg-transparent hover:bg-[#1D202A]">
                                <ion-icon name="text"></ion-icon>
                            </button>
                            <button className="absolute top-[50px] left-[270px] w-12 h-12 rounded-lg border border-[#616678] flex justify-center items-center cursor-pointer text-lg text-[#888] bg-transparent hover:bg-[#1D202A]">
                                <ion-icon name="calculator-outline"></ion-icon>
                            </button>
                        </div>
                    </div>
                    <div className="absolute top-1/2 right-[1%] transform -translate-y-1/2 rounded-3xl h-[95%] w-[48%] bg-[#030712] border border-[#616678] overflow-hidden">
                        <ion-icon name="aperture" className="absolute top-[5%] left-[5%] text-5xl text-white font-medium"></ion-icon>
                        <div className="absolute left-[12%] top-[5%] text-2xl text-white font-kanit">Text to Image Integration</div>
                        <div className="absolute top-[15%] left-[12%] text-[#888] w-[40%] flex-wrap font-kanit">Transform your thoughts into embedded arts inside your blogs in one click</div>
                        <div className="absolute top-[35%] w-[90%] left-[5%] h-auto" style={{backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.171) 2px, transparent 0)", backgroundSize: "20px 20px", backgroundPosition: "-5px -5px"}}>
                            <div className="relative w-full h-16 flex items-center">
                                <input type="text" name="text" className="border-none bg-transparent w-full outline-none indent-2.5 text-[#888] placeholder-[#888]" placeholder="" value="Type in Your Prompt" readOnly spellCheck="false" autoComplete="off" />
                                <div className="absolute right-[5%] top-1/2 transform -translate-y-1/2 cursor-pointer text-2xl text-[#888]">
                                    <ion-icon name="sparkles"></ion-icon>
                                </div>
                            </div>
                            <div className="flex gap-4 mt-8 flex-wrap">
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-[#1D202A] to-[#030712] border border-[#616678]"></div>
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-[#1D202A] to-[#030712] border border-[#616678]"></div>
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-[#1D202A] to-[#030712] border border-[#616678]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative top-0 w-full bg-transparent border-l border-l-[#1D202A] border-r border-r-[#1D202A] overflow-hidden">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-auto w-[94%] bg-[#1D202A]">
                    <div className="absolute top-1/2 left-[1%] right-[1%] transform -translate-y-1/2 rounded-3xl h-auto w-[98%] bg-[#030712] border border-[#616678] overflow-hidden py-12 px-8" style={{backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.171) 2px, transparent 0)", backgroundSize: "30px 30px", backgroundPosition: "-5px -5px"}}>
                        <div className="absolute top-[5%] left-[5%]">
                            <ion-icon name="triangle-outline" className="text-4xl text-white"></ion-icon>
                            <ion-icon name="triangle-outline" className="absolute text-4xl text-[#888] blur-sm"></ion-icon>
                            <ion-icon name="ellipse-outline" className="absolute text-4xl text-white mt-12"></ion-icon>
                            <ion-icon name="ellipse-outline" className="absolute text-4xl text-[#888] blur-sm mt-12"></ion-icon>
                            <ion-icon name="square-outline" className="absolute text-4xl text-white mt-24"></ion-icon>
                            <ion-icon name="square-outline" className="absolute text-4xl text-[#888] blur-sm mt-24"></ion-icon>
                        </div>
                        <div className="absolute left-20 top-[5%] font-kanit text-xl text-white font-medium">Inkflow - Collaborative Workspace for Creative Ones</div>
                        <div className="absolute top-[12%] left-20 text-[#888] font-kanit w-[50%] text-sm">Lorem ipsum dolor, sit amet consectetur adipisicing elit. Corrupti dolores vero totam voluptatem tenetur</div>
                        <div className="absolute top-[30%] left-[5%] w-[90%] h-[60%] rounded-2xl border border-[#616678] overflow-hidden flex items-center justify-center">
                            <div className="w-full h-full bg-gradient-to-br from-[#1D202A] to-[#030712] rounded-2xl"></div>
                        </div>
                    </div>
                

                    <div className="absolute top-1/2 right-[1%] transform -translate-y-1/2 rounded-3xl h-auto w-[98%] bg-[#030712] border border-[#616678] overflow-hidden py-12 px-8">
                        <div className="font-kanit text-xl text-white font-medium mb-4">Create ASCII Art Visuals directly from text</div>
                        <div className="text-[#888] font-kanit text-sm mb-6">Lorem ipsum dolor sit amet, consectetur adipisicing elit. Voluptates neque nisi numquam veritatis sit error</div>
                        <div className="text-white text-2xl mb-6">
                            <ion-icon name="aperture-outline"></ion-icon>
                        </div>

                        <div className="w-full">
                            <textarea className="w-full h-32 bg-[#10141E] border border-[#616678] rounded-lg p-4 text-[#888] resize-none font-mono text-sm" defaultValue="A Car Lorem ipsum dolor sit amet consectetur adipisicing elit. Maxime fuga vero esse earum quaerat provident asperiores soluta quae at eum dignissimos excepturi aliquam dolorum cumque facere, dolores unde fugiat neque?" readOnly></textarea>
                            <pre className="w-full bg-[#10141E] border border-[#616678] rounded-lg p-4 mt-4 text-[#888] font-mono text-xs overflow-auto max-h-48">
{`                            ______
                            /|_||_\`.__
                           (   _    _ _\\
                           =\`-(_)--(_)-'`}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>
    </>
  );
}
