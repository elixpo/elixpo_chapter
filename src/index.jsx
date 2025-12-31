import './App.css';
import './styles/homepage/header.css'
import './styles/homepage/innerLayout.css'
import './styles/homepage/innerLayoutPseudo.css'
import './styles/homepage/responsive.css'
export default function App() {
  return (
    <>
   <div className="appHeader">
        <div className="logo"></div>
        <p className="appName">LixBlogs</p>

        <div className="writeIcon"> <ion-icon name="pencil"></ion-icon> Write</div>
        <div className="signin">Sign-In</div>
        <div className="getStartedBtn">
            <span>Get started</span>
        </div>
        <ion-icon name="logo-github" className="githubLogo"></ion-icon>
    </div>
    <div className="container" id="container">


        <div className="innerLayout">
            <div className="firstSection">
                <div className="descText">console.log("A place to read write and enjoy the creative aspect");</div>
            </div>
            <div className="secondSection">
                <div className="mainText">
                    <p className="welcomeText">Write Read and Endulge into creativity, enjoy the power of AI and
                        Imagination.</p>
                    <div className="backgroundImage"></div>
                </div>
            </div>
            <div className="thirdSection">
                <div className="readBlogsBtn">
                    <span className="label">{`>`} Read Blogs</span>
                    <span className="gradient-container">
                        <span className="gradient"></span>
                    </span>
                </div>
                <div className="starGithub">
                    <span className="label">⭐ GitHub Star</span>
                </div>
            </div>

            <div className="fourthSection">
                <div className="fourthSectionBackdrop">
                    <div className="fourthSectionBackdropv-2">
                        <ion-icon name="document-outline" className="documentIcon"></ion-icon>
                        <div className="heading">Easy UI For Quick Production</div>
                        <div className="desc">Ultimately, our goal is to deepen our collective understanding of the world
                            through the power of writing.</div>

                        <div className="documentContainer">
                            <div className="terminal">
                                <div className="terminal-header">
                                    <div className="terminal-header-left">
                                        <div className="circles">
                                            <span className="terminalCircle"></span>
                                            <span className="terminalCircle"></span>
                                            <span className="terminalCircle"></span>
                                        </div>
                                    </div>
                                </div>
                                <div className="terminal-content">
                                    <div className="titleHolder"> <ion-icon name="add-circle-outline" className="hidden">
                                        </ion-icon> <input type="text" placeholder="You know, where you are at!" /> </div>
                                    <div className="titleHolder">
                                        <ion-icon name="add-circle-outline"></ion-icon>
                                        <div className="content">
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

            <div className="fifthSection">
                <div className="fifthSectionBackdrop">
                    <div className="fifthSectionBackdropv-1">
                        <ion-icon name="chatbox-ellipses-outline" className="documentIcon"></ion-icon>
                        <div className="heading">Quick Elixpo AI Co-pilot </div>
                        <div className="desc">I'm your AI Search Engine, ready to help you with any questions or tasks you
                            have.</div>

                        <div className="documentContainer">
                            <div className="search-container">
                                <div className="search-bar-wrapper">
                                    <input type="text" className="search-bar" placeholder="Search anything..."
                                        value="Starlink Latest Purchase of OpenAI" readOnly spellCheck="false"
                                        autoComplete="off" />
                                    <div className="icon-group">
                                        <ion-icon name="refresh-outline"> </ion-icon>
                                    </div>
                                </div>
                            </div>

                            <button className="quick-action newspaper">
                                <ion-icon name="newspaper-outline"></ion-icon>
                            </button>
                            <button className="quick-action code">
                                <ion-icon name="code-outline"></ion-icon>
                            </button>
                            <button className="quick-action reader">
                                <ion-icon name="reader-outline"></ion-icon>
                            </button>
                            <button className="quick-action translate">
                                <ion-icon name="text"></ion-icon>
                            </button>
                            <button className="quick-action calculator">
                                <ion-icon name="calculator-outline"></ion-icon>
                            </button>
                        </div>
                    </div>
                    <div className="fifthSectionBackdropv-2">
                        <ion-icon name="aperture" className="documentIcon"></ion-icon>
                        <div className="heading">Text to Image Integration</div>
                        <div className="desc">Transfrom your thoughts into embedded arts inside your blogs in one click
                        </div>
                        <div className="documentContainer">
                            <div className="input__container">
                                <input type="text" name="text" className="input__search" placeholder=""
                                    value="Type in Your Prompt" readOnly spellCheck="false" autoComplete="off" />
                                <div className="generateIcon">
                                    <ion-icon name="sparkles"></ion-icon>
                                </div>
                            </div>
                            <div className="imageContainer">
                                <div className="imagePlaceholder"></div>
                                <div className="imagePlaceholder"></div>
                                <div className="imagePlaceholder"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="sixthSection">
                <div className="sixthSectionBackdrop">
                    <div className="sixthSectionBackdropv1" id="sixthSectionBackdropv1">
                        <div className="documentIcon"></div>
                        <div className="blob1"></div>
                        <div className="blob2"></div>
                        <div className="heading">Inkflow - Collaborative Workspace for Creative Ones</div>
                        <div className="desc">Lorem ipsum dolor, sit amet consectetur adipisicing elit. Corrupti dolores
                            vero totam voluptatem tenetur </div>
                        <div className="iconsControl">
                            <ion-icon name="triangle-outline" className="triangle"></ion-icon>
                            <ion-icon name="triangle-outline" className="triangle shadow"></ion-icon>
                            <ion-icon name="ellipse-outline" className="circle"></ion-icon>
                            <ion-icon name="ellipse-outline" className="circle shadow"></ion-icon>
                            <ion-icon name="square-outline" className="square"></ion-icon>
                            <ion-icon name="square-outline" className="square shadow"></ion-icon>
                        </div>
                        <div className="documentContainer" id="documentContainer">
                            <div className="imageContainer"></div>
                        </div>
                    </div>
                

                <div className="sixthSectionBackdropv2">
                    <div className="heading">Create ASCII Art Visuals directly from text</div>
                    <div className="desc">Lorem ipsum dolor sit amet, consectetur adipisicing elit. Voluptates neque nisi
                        numquam veritatis sit error </div>
                    <div className="documentIcon"> <ion-icon name="aperture-outline"></ion-icon> </div>

                    <div className="documentContainer">
                        <div className="promptTextBox" id="promptTextBox">A Car Lorem ipsum dolor sit amet consectetur
                            adipisicing elit. Maxime fuga vero esse earum quaerat provident asperiores soluta quae at
                            eum dignissimos excepturi aliquam dolorum cumque facere, dolores unde fugiat neque?</div>
                        <pre className="asciiArtZone" id="asciiArtZone">

                            ______
                            /|_||_\`.__
                           (   _    _ _\
                           =`-(_)--(_)-'
                    
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
