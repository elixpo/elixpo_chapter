import '../styles/about/about.css'

export default function AboutPage() {
    document.title = 'About - LixBlogs';
    return (
        <div className="container absolute flex flex-col h-full max-w-[2560px] bg-[#030712] box-border">
            <div className="appHeader">
                <div className="logo"></div>
                <p className="appName">LixBlogs</p>
            </div>
        </div>
    );
}
