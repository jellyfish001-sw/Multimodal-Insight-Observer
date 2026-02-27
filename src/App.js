import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeDownload from './components/YouTubeDownload';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('chatapp_user');
    if (!u) return null;
    const fn = localStorage.getItem('chatapp_firstName') || '';
    const ln = localStorage.getItem('chatapp_lastName') || '';
    return { username: u, firstName: fn, lastName: ln };
  });
  const [activeTab, setActiveTab] = useState('chat');
  const [interviewContext, setInterviewContext] = useState(null);

  const handleLogin = (username, firstName = '', lastName = '') => {
    localStorage.setItem('chatapp_user', username);
    localStorage.setItem('chatapp_firstName', firstName || '');
    localStorage.setItem('chatapp_lastName', lastName || '');
    setUser({ username, firstName: firstName || '', lastName: lastName || '' });
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    localStorage.removeItem('chatapp_firstName');
    localStorage.removeItem('chatapp_lastName');
    setUser(null);
  };

  if (user) {
    return (
      <div className="app-logged-in">
        <nav className="app-tabs">
          <button
            className={activeTab === 'chat' ? 'active' : ''}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={activeTab === 'youtube' ? 'active' : ''}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube Channel Download
          </button>
        </nav>
        {activeTab === 'chat' ? (
          <Chat
            username={user.username}
            firstName={user.firstName}
            lastName={user.lastName}
            onLogout={handleLogout}
            interviewContext={interviewContext}
            onClearInterviewContext={() => setInterviewContext(null)}
          />
        ) : (
          <YouTubeDownload
            onBack={() => setActiveTab('chat')}
            onStartInterview={(ctx) => {
              setInterviewContext(ctx);
              setActiveTab('chat');
            }}
          />
        )}
      </div>
    );
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
