const SUPABASE_URL = 'https://bxhrnnwfqlsoviysqcdw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4aHJubndmcWxzb3ZpeXNxY2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3ODkzNDIsImV4cCI6MjA4MTM2NTM0Mn0.O7fpv0TrDd-8ZE3Z9B5zWyAuWROPis5GRnKMxmqncX8';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let myData = null, activeChat = null, isReg = false;
let onlineUsers = {}, typingTimeout, tempAvatarBase64 = null;
let pressTimer;
let unreadCounts = {};

// Toggle login/register
window.toggleAuth = function() { 
    isReg = !isReg; 
    document.getElementById('auth-title').innerText = isReg ? "DAFTAR" : "MASUK";
    document.getElementById('toggle-text').innerText = isReg ? "SUDAH PUNYA AKUN? LOGIN" : "BELUM PUNYA AKUN? DAFTAR";
    document.getElementById('reg-extra').classList.toggle('hidden', !isReg); 
}

// Handle authentication
window.handleAuth = async function() {
    const user = document.getElementById('username-field').value.trim().toLowerCase();
    const pass = document.getElementById('password-field').value;
    
    if(!user || !pass) return alert("Isi semua!");
    
    if (isReg) {
        const confirmPass = document.getElementById('confirm-field').value;
        if (pass !== confirmPass) return alert("Password tidak cocok!");
        
        const uid = Math.floor(100000 + Math.random() * 900000).toString();
        const { error } = await sb.from('profiles_webchat').insert([{ 
            username: user, 
            password: pass, 
            unique_id: uid 
        }]);
        
        if(error) return alert("Gagal Daftar!");
        alert("Berhasil! Silakan Login."); 
        location.reload();
    } else {
        const { data } = await sb.from('profiles_webchat')
            .select('*')
            .eq('username', user)
            .eq('password', pass)
            .maybeSingle();
        
        if (!data) return alert("Gagal Login!");
        myData = data; 
        startApp();
    }
}

// Start app after login
function startApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('my-name').innerText = myData.username.toUpperCase();
    document.getElementById('my-id').innerText = "ID: " + myData.unique_id;
    updateMyDisplay(); 
    loadContacts(); 
    setupRealtime();
}

// Update my profile display
function updateMyDisplay() { 
    document.getElementById('my-avatar').src = myData.avatar_url || `https://ui-avatars.com/api/?name=${myData.username}`; 
}

// Load contacts
async function loadContacts() {
    const { data: profiles } = await sb.from('profiles_webchat')
        .select('*')
        .neq('unique_id', myData.unique_id);
    
    const container = document.getElementById('contact-list');
    container.innerHTML = "";
    
    profiles?.forEach(p => {
        const isOnline = onlineUsers[p.unique_id];
        const unread = unreadCounts[p.unique_id] || 0;
        const div = document.createElement('div');
        div.className = `contact-item`;
        div.innerHTML = `
            <img src="${p.avatar_url || 'https://ui-avatars.com/api/?name='+p.username}" class="avatar">
            <div style="flex:1; position:relative;">
                <div style="font-weight:900">${p.username.toUpperCase()}</div>
                <small style="display:flex; align-items:center; gap:5px;">
                    <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span> 
                    ${isOnline ? 'Online' : 'Offline'}
                </small>
                ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
            </div>`;
        div.onclick = () => openChat(p);
        container.appendChild(div);
    });
}

// Open chat with a contact
window.openChat = function(profile) {
    activeChat = profile;
    document.getElementById('chat-area').classList.add('active');
    document.getElementById('target-name').innerText = profile.username.toUpperCase();
    document.getElementById('target-avatar').src = profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.username}`;
    document.getElementById('chat-footer').classList.remove('hidden');
    document.getElementById('info-btn').classList.remove('hidden');
    
    // Update status
    const isOnline = onlineUsers[profile.unique_id];
    document.getElementById('target-status').innerText = isOnline ? 'Online' : 'Offline';
    document.getElementById('target-status').style.color = isOnline ? 'var(--green)' : '#bbb';
    
    loadMessages(); 
    markAsRead();
    
    // Reset unread count
    if (unreadCounts[profile.unique_id]) {
        delete unreadCounts[profile.unique_id];
        loadContacts();
    }
}

// Close chat
window.closeChat = function() { 
    document.getElementById('chat-area').classList.remove('active'); 
    activeChat = null; 
    
    document.getElementById('target-name').innerText = "PILIH CHAT";
    document.getElementById('target-status').innerText = "";
    document.getElementById('chat-footer').classList.add('hidden');
    document.getElementById('info-btn').classList.add('hidden');
    document.getElementById('messages-container').innerHTML = "";
}

// Load messages
async function loadMessages() {
    if (!activeChat) return;
    
    const { data } = await sb.from('messages_webchat')
        .select('*')
        .order('created_at', { ascending: true });
    
    const container = document.getElementById('messages-container');
    container.innerHTML = "";
    
    data?.filter(m => 
        (m.sender_unique_id === myData.unique_id && m.receiver_id === activeChat.unique_id) || 
        (m.receiver_id === myData.unique_id && m.sender_unique_id === activeChat.unique_id)
    ).forEach(renderMsg);
    
    container.scrollTop = container.scrollHeight;
}

// Render a message
function renderMsg(m) {
    const container = document.getElementById('messages-container');
    const isMe = m.sender_unique_id === myData.unique_id;
    const div = document.createElement('div');
    div.className = `bubble ${isMe ? 'sent' : 'received'}`;
    const time = new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let contentHtml = '';
    if (m.image_url) {
        const isVideo = m.image_url.includes('.mp4') || m.image_url.includes('.webm') || m.file_type?.includes('video');
        if (isVideo) {
            contentHtml = `<video src="${m.image_url}" controls class="msg-media"></video>`;
        } else if (m.file_type?.includes('audio')) {
            contentHtml = `<audio src="${m.image_url}" controls class="msg-media"></audio>`;
        } else {
            contentHtml = `<img src="${m.image_url}" class="msg-img">`;
        }
    }
    
    if (m.content) {
        // Check if content is a URL
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let processedContent = m.content.replace(urlRegex, url => {
            return `<a href="${url}" target="_blank" class="message-link">${url}</a>`;
        });
        contentHtml += `<span>${processedContent}</span>`;
    }
    
    div.innerHTML = `
        ${contentHtml}
        <div class="msg-info">
            ${time} 
            ${isMe ? (m.is_read ? '✓✓' : '✓') : ''}
            ${m.likes > 0 ? `<span class="like-count">❤️ ${m.likes}</span>` : ''}
        </div>
        ${!isMe ? '<button class="like-btn" onclick="likeMessage(\'' + m.id + '\')">❤️</button>' : ''}
    `;

    // Long press untuk hapus
    div.onmousedown = () => pressTimer = setTimeout(() => deleteMsg(m.id), 800);
    div.onmouseup = () => clearTimeout(pressTimer);
    div.ontouchstart = () => pressTimer = setTimeout(() => deleteMsg(m.id), 800);
    div.ontouchend = () => clearTimeout(pressTimer);

    container.appendChild(div);
}

// Delete message
async function deleteMsg(id) {
    if(confirm("Hapus pesan ini?")) {
        await sb.from('messages_webchat').delete().eq('id', id);
    }
}

// Like message
window.likeMessage = async function(id) {
    await sb.from('messages_webchat')
        .update({ likes: sb.sql`likes + 1` })
        .eq('id', id);
}

// Send message
window.sendMsg = async function(fileData = null, fileType = null) {
    const inp = document.getElementById('msg-input');
    const content = inp.value.trim();
    
    if(!content && !fileData) return;
    
    inp.value = "";
    
    const msgData = {
        sender_unique_id: myData.unique_id, 
        receiver_id: activeChat.unique_id, 
        content
    };
    
    if (fileData) {
        msgData.image_url = fileData;
        if (fileType) msgData.file_type = fileType;
    }
    
    await sb.from('messages_webchat').insert([msgData]);
}

// Upload file (image, video, audio, etc)
window.uploadFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const fileType = file.type;
        sendMsg(e.target.result, fileType);
    };
    reader.readAsDataURL(file);
}

// Preview profile picture
window.previewProfile = function(input) {
    const reader = new FileReader();
    reader.onload = (e) => { 
        tempAvatarBase64 = e.target.result; 
        document.getElementById('edit-preview').src = tempAvatarBase64; 
    };
    reader.readAsDataURL(input.files[0]);
}

// Save profile
window.saveProfile = async function() {
    const bio = document.getElementById('edit-bio').value;
    const upd = { bio }; 
    
    if(tempAvatarBase64) upd.avatar_url = tempAvatarBase64;
    
    await sb.from('profiles_webchat').update(upd).eq('unique_id', myData.unique_id);
    myData.bio = bio; 
    
    if(tempAvatarBase64) myData.avatar_url = tempAvatarBase64;
    
    updateMyDisplay(); 
    closeModal('profile-modal');
}

// Mark messages as read
async function markAsRead() {
    if(!activeChat) return;
    
    await sb.from('messages_webchat')
        .update({ is_read: true })
        .eq('receiver_id', myData.unique_id)
        .eq('sender_unique_id', activeChat.unique_id);
}

// Setup realtime listeners
function setupRealtime() {
    // Listen for new messages
    sb.channel('chat-main')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'messages_webchat' 
        }, (payload) => { 
            loadMessages();
            
            // Update unread count
            if (payload.new && payload.new.receiver_id === myData.unique_id && !payload.new.is_read) {
                const senderId = payload.new.sender_unique_id;
                unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
                if (activeChat?.unique_id !== senderId) {
                    loadContacts();
                }
            }
            
            markAsRead();
        }).subscribe();
    
    // Setup presence for online status
    const presence = sb.channel('online-status');
    
    presence.on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState(); 
        onlineUsers = {};
        
        for (const id in state) { 
            onlineUsers[state[id][0].uid] = true; 
        }
        
        loadContacts();
        
        if (activeChat && onlineUsers[activeChat.unique_id]) {
            document.getElementById('target-status').innerText = 'Online';
            document.getElementById('target-status').style.color = 'var(--green)';
        }
    }).on('broadcast', { event: 'typing' }, (p) => {
        if(activeChat && p.payload.uid === activeChat.unique_id) {
            document.getElementById('target-status').innerText = p.payload.isTyping ? "sedang mengetik..." : "";
        }
    }).subscribe(async (s) => { 
        if (s === 'SUBSCRIBED') await presence.track({ uid: myData.unique_id }); 
    });

    // Typing indicator
    document.getElementById('msg-input').oninput = () => {
        presence.send({ 
            type: 'broadcast', 
            event: 'typing', 
            payload: { uid: myData.unique_id, isTyping: true } 
        });
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => presence.send({ 
            type: 'broadcast', 
            event: 'typing', 
            payload: { uid: myData.unique_id, isTyping: false } 
        }), 2000);
    };
}

// Open my profile
window.openMyProfile = function() {
    document.getElementById('edit-bio').value = myData.bio || "";
    document.getElementById('edit-preview').src = myData.avatar_url || `https://ui-avatars.com/api/?name=${myData.username}`;
    document.getElementById('profile-modal').classList.remove('hidden');
};

// Open target profile
window.openTargetProfile = function() {
    if(!activeChat) return;
    
    document.getElementById('v-avatar').src = activeChat.avatar_url || `https://ui-avatars.com/api/?name=${activeChat.username}`;
    document.getElementById('v-name').innerText = activeChat.username;
    document.getElementById('v-bio').innerText = activeChat.bio || "Tidak ada bio.";
    document.getElementById('v-id').innerText = "ID: " + activeChat.unique_id;
    document.getElementById('view-profile-modal').classList.remove('hidden');
};

// Close modal
window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
};

// Send message on Enter key
document.getElementById('msg-input').onkeypress = (e) => { 
    if(e.key === 'Enter') sendMsg(); 
};

// Search contact by name or ID
window.searchContact = function() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const contacts = document.querySelectorAll('.contact-item');
    
    contacts.forEach(contact => {
        const name = contact.querySelector('div[style*="font-weight:900"]').textContent.toLowerCase();
        const id = contact.querySelector('small').textContent.toLowerCase();
        const shouldShow = name.includes(query) || id.includes(query);
        contact.style.display = shouldShow ? 'flex' : 'none';
    });
};

// Create status
window.createStatus = async function() {
    const statusText = document.getElementById('status-input').value;
    if (!statusText) return;
    
    await sb.from('statuses').insert([{
        user_id: myData.unique_id,
        text: statusText,
        likes: 0
    }]);
    
    alert("Status berhasil dibuat!");
    closeModal('status-modal');
};

// Add contact manually
window.addContactManual = async function() {
    const sid = document.getElementById('search-id').value;
    const { data } = await sb.from('profiles_webchat')
        .select('*')
        .eq('unique_id', sid)
        .single();
    
    if (data) {
        alert("Berhasil Menemukan: " + data.username);
        loadContacts();
    } else {
        alert("ID tidak ditemukan");
    }
};
