import { useState, useRef, useEffect } from 'react';

export function DigiFloatingChat({ invoke, currentContext = {}, onDataChanged }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm **DIGI**, your AI assistant for Digiworld. You can ask me how many client sites are active, check prospect trial expirations, ask about traffic stats, or paste raw client text for me to parse."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;

    const userMessage = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await invoke({
        action: 'digi_chat',
        prompt,
        history: messages,
        current_context: currentContext
      });

      if (res?.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
        if (res.updated_site_id && typeof onDataChanged === 'function') {
          onDataChanged(res.updated_site_id);
        }
      } else {
        throw new Error(res?.error || 'No response from DIGI.');
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I encountered an issue: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="digi-floating-wrapper">
      {!isOpen && (
        <button
          type="button"
          className="digi-floating-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Open DIGI AI Assistant"
        >
          <span className="digi-sparkle">✦</span>
          <span className="digi-trigger-label">Ask DIGI AI</span>
        </button>
      )}

      {isOpen && (
        <div className="digi-chat-window" role="dialog" aria-label="DIGI AI Assistant">
          <div className="digi-chat-header">
            <div className="digi-chat-header-info">
              <span className="digi-avatar">D</span>
              <div>
                <strong>DIGI AI Assistant</strong>
                <small>Digiworld Operations &bull; Claude 3.5</small>
              </div>
            </div>
            <button
              type="button"
              className="digi-chat-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close DIGI Chat"
            >
              &times;
            </button>
          </div>

          <div className="digi-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`digi-message-bubble ${msg.role}`}>
                <div className="digi-message-content">
                  {msg.content.split('\n').map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="digi-message-bubble assistant loading">
                <span className="digi-typing-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="digi-chat-input-form" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="Ask DIGI (e.g. How many sites are active?)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label="Send">
              &uarr;
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
export default DigiFloatingChat;
