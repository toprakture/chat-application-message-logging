document.addEventListener('DOMContentLoaded', () => {
    const currentUser = localStorage.getItem('chat_username');
    
    if (!currentUser) {
        window.location.href = '/';
        return;
    }

    document.getElementById('currentUserName').textContent = currentUser;

    const contactList = document.getElementById('contactList');
    const chatHeader = document.getElementById('chatHeader');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    const chatMessages = document.getElementById('chatMessages');
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const activeContactName = document.getElementById('activeContactName');
    const logoutBtn = document.getElementById('logoutBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const aboutBtn = document.getElementById('aboutBtn');
    const legalBtn = document.getElementById('legalBtn');

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('chat_username');
        window.location.href = '/';
    });

    settingsBtn.addEventListener('click', () => alert('Ayarlar menüsü yapım aşamasında!'));
    aboutBtn.addEventListener('click', () => alert('Nexus Chat - Version 1.0'));
    legalBtn.addEventListener('click', () => alert('Yasal Bildirimler ve Gizlilik Politikası'));

    let activeContact = null;
    let ws = null;

    // Connect WebSocket
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${currentUser}`;
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === "system" && data.action === "refresh_contacts") {
                loadContacts();
                return;
            }

            // Only append if the message belongs to the active conversation
            if ((data.sender === activeContact && data.receiver === currentUser) || 
                (data.sender === currentUser && data.receiver === activeContact)) {
                appendMessage(data.sender, data.content, data.timestamp);
                scrollToBottom();
            } else {
                // Future: Add unread badge to contact list item
                console.log("New message from", data.sender);
            }
        };

        ws.onclose = () => {
            setTimeout(connectWebSocket, 1000); // Reconnect
        };
    }
    
    connectWebSocket();

    // Load Contacts
    async function loadContacts() {
        try {
            const res = await fetch('/users');
            const users = await res.json();
            
            contactList.innerHTML = '';
            users.forEach(user => {
                if (user.username !== currentUser) {
                    const contactDiv = document.createElement('div');
                    contactDiv.className = `contact-item ${activeContact === user.username ? 'active' : ''}`;
                    contactDiv.innerHTML = `
                        <div class="avatar"></div>
                        <div class="contact-name">${user.username}</div>
                    `;
                    contactDiv.onclick = () => selectContact(user.username);
                    contactList.appendChild(contactDiv);
                }
            });
        } catch (err) {
            console.error("Error loading contacts", err);
        }
    }

    loadContacts();

    function selectContact(username) {
        activeContact = username;
        activeContactName.textContent = username;
        
        // UI updates
        chatPlaceholder.style.display = 'none';
        chatHeader.style.display = 'flex';
        chatMessages.style.display = 'flex';
        messageForm.style.display = 'flex';
        
        // Highlight in sidebar
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        const activeItem = Array.from(document.querySelectorAll('.contact-item')).find(el => el.textContent.trim() === username);
        if (activeItem) activeItem.classList.add('active');

        // Load History
        loadHistory(username);
    }

    async function loadHistory(contact) {
        chatMessages.innerHTML = '';
        try {
            const res = await fetch(`/history?contact=${contact}&current_user=${currentUser}`);
            const messages = await res.json();
            
            messages.forEach(msg => appendMessage(msg.sender, msg.content, msg.timestamp));
            scrollToBottom();
        } catch (err) {
            console.error("Failed to load history:", err);
        }
    }

    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();
        if (content && activeContact && ws && ws.readyState === WebSocket.OPEN) {
            const payload = {
                receiver: activeContact,
                content: content
            };
            ws.send(JSON.stringify(payload));
            messageInput.value = '';
        }
    });

    function appendMessage(sender, content, timestamp) {
        const isSent = sender === currentUser;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
        
        const timeString = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            ${escapeHtml(content)}
            <span class="message-meta">${timeString}</span>
        `;
        
        chatMessages.appendChild(messageDiv);
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
