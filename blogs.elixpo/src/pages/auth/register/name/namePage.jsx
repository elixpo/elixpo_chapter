import '../styles/auth/login.css';


const NamePage = () => {
    return (
        <div>
            <h1>Register - Name</h1>
            <form>
                <label htmlFor="name">Name:</label>
                <input id="name" name="name" type="text" />
                <button type="submit">Continue</button>
            </form>
        </div>
    );
};

export default NamePage;