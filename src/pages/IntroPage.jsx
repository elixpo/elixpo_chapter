export default function IntroPage() {
  return (
    <div className="page-container intro-page">
      <div className="innerLayout">
        <div className="firstSection">
          <div className="descText">console.log("A place to read write and enjoy the creative aspect");</div>
        </div>
        <div className="secondSection">
          <div className="mainText">
            <p className="welcomeText">Write Read and Endulge into creativity, enjoy the power of AI and Imagination.</p>
            <div className="backgroundImage"></div>
          </div>
        </div>
        <div className="thirdSection">
          <div className="readBlogsBtn">
            <span className="label">> Read Blogs</span>
            <span className="gradient-container">
              <span className="gradient"></span>
            </span>
          </div>
          <div className="starGithub">
            <span className="label">⭐ GitHub Star</span>
          </div>
        </div>
      </div>
    </div>
  );
}
