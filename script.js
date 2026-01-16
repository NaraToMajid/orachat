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
    loadStatuses();
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
    
    // Add status section
    const statusSection = document.createElement('div');
    statusSection.className = "status-section";
    statusSection.innerHTML = `
        <div style="padding:15px; border-bottom:2px solid #eee; font-weight:900; display:flex; justify-content:space-between; align-items:center;">
            <span>STATUS TERBARU</span>
            <button onclick="openModal('status-modal')" style="font-size:10px; padding:5px 10px;">+ BUAT</button>
        </div>
        <div id="status-list" style="padding:10px;"></div>
    `;
    container.appendChild(statusSection);
    
    // Add contacts header
    const contactsHeader = document.createElement('div');
    contactsHeader.className = "contacts-header";
    contactsHeader.innerHTML = `
        <div style="padding:15px; border-bottom:2px solid #eee; font-weight:900;">
            KONTAK (${profiles?.length || 0})
        </div>
    `;
    container.appendChild(contactsHeader);
    
    // Add contacts
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
            </div>
        `;
        div.onclick = () => openChat(p);
        container.appendChild(div);
    });
}

// Load statuses
async function loadStatuses() {
    const { data: statuses } = await sb.from('statuses')
        .select('*, profiles_webchat(username, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(10);
    
    const container = document.getElementById('status-list');
    if (!container) return;
    
    container.innerHTML = "";
    
    statuses?.forEach(s => {
        const div = document.createElement('div');
        div.className = "status-item";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
                <img src="${s.profiles_webchat.avatar_url || 'https://ui-avatars.com/api/?name='+s.profiles_webchat.username}" 
                     style="width:30px; height:30px; border-radius:50%; border:2px solid #000;">
                <span style="font-weight:700;">${s.profiles_webchat.username}</span>
            </div>
            <div style="background:#f0f0f0; padding:10px; border-radius:10px; border:2px solid #000; margin-bottom:5px;">
                ${s.text}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                <span>${new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <button onclick="likeStatus(${s.id})" style="background:none; border:none; cursor:pointer; padding:5px;">
                    ${s.likes > 0 ? `❤️ ${s.likes}` : '🤍'}
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

// Like status
window.likeStatus = async function(id) {
    await sb.from('statuses')
        .update({ likes: sb.sql`likes + 1` })
        .eq('id', id);
    loadStatuses();
};

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
        const isAudio = m.file_type?.includes('audio');
        const isPDF = m.file_type?.includes('pdf');
        const isDocument = m.file_type?.includes('document') || m.file_type?.includes('msword') || m.file_type?.includes('text');
        
        if (isVideo) {
            contentHtml = `
                <div class="file-container">
                    <video src="${m.image_url}" controls class="msg-media"></video>
                    <small>🎥 Video</small>
                </div>`;
        } else if (isAudio) {
            contentHtml = `
                <div class="file-container">
                    <audio src="${m.image_url}" controls class="msg-media"></audio>
                    <small>🎵 Audio</small>
                </div>`;
        } else if (isPDF || isDocument) {
            const fileName = m.file_type || "File";
            contentHtml = `
                <div class="file-container" style="background:#f0f0f0; padding:10px; border-radius:8px; border:2px solid #000;">
                    <div style="font-weight:900; margin-bottom:5px;">📄 ${fileName.split('/').pop() || 'File'}</div>
                    <a href="${m.image_url}" download target="_blank" style="color:var(--blue); text-decoration:none; font-weight:700;">
                        📥 Download File
                    </a>
                </div>`;
        } else {
            contentHtml = `<img src="${m.image_url}" class="msg-img">`;
        }
    }
    
    if (m.content) {
        // Check if content is a URL
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let processedContent = m.content.replace(urlRegex, url => {
            const cleanUrl = url.replace(/[.,;!?]$/, '');
            return `<a href="${cleanUrl}" target="_blank" class="message-link">${cleanUrl}</a>`;
        });
        contentHtml += `<div class="message-text">${processedContent}</div>`;
    }
    
    div.innerHTML = `
        ${contentHtml}
        <div class="msg-info">
            <span>${time}</span>
            ${isMe ? (m.is_read ? '<span style="color:var(--blue);">✓✓</span>' : '<span>✓</span>') : ''}
            ${m.likes > 0 ? `<span class="like-count">❤️ ${m.likes}</span>` : ''}
        </div>
        ${!isMe ? '<button class="like-btn" onclick="likeMessage(\'' + m.id + '\')" title="Suka pesan ini">❤️</button>' : ''}
    `;

    // Long press untuk hapus (hanya pesan sendiri)
    if (isMe) {
        div.onmousedown = () => pressTimer = setTimeout(() => deleteMsg(m.id), 1000);
        div.onmouseup = () => clearTimeout(pressTimer);
        div.onmouseleave = () => clearTimeout(pressTimer);
        div.ontouchstart = () => pressTimer = setTimeout(() => deleteMsg(m.id), 1000);
        div.ontouchend = () => clearTimeout(pressTimer);
    }

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
    
    loadMessages();
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
        content,
        is_read: false,
        likes: 0
    };
    
    if (fileData) {
        msgData.image_url = fileData;
        if (fileType) msgData.file_type = fileType;
    }
    
    const { error } = await sb.from('messages_webchat').insert([msgData]);
    
    if (error) {
        console.error("Gagal mengirim pesan:", error);
        alert("Gagal mengirim pesan!");
    }
}

// Upload file (image, video, audio, etc)
window.uploadFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Reset input
    input.value = '';
    
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 10) {
        alert("File terlalu besar! Maksimal 10MB.");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const fileType = file.type;
        sendMsg(e.target.result, fileType);
    };
    reader.onerror = () => {
        alert("Gagal membaca file!");
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
    
    const { error } = await sb.from('profiles_webchat').update(upd).eq('unique_id', myData.unique_id);
    
    if (error) {
        alert("Gagal menyimpan profil!");
        return;
    }
    
    myData.bio = bio; 
    
    if(tempAvatarBase64) myData.avatar_url = tempAvatarBase64;
    
    updateMyDisplay(); 
    closeModal('profile-modal');
    alert("Profil berhasil diperbarui!");
}

// Mark messages as read
async function markAsRead() {
    if(!activeChat) return;
    
    await sb.from('messages_webchat')
        .update({ is_read: true })
        .eq('receiver_id', myData.unique_id)
        .eq('sender_unique_id', activeChat.unique_id)
        .eq('is_read', false);
}

// Setup realtime listeners
function setupRealtime() {
    // Listen for new messages
    sb.channel('chat-main')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages_webchat' 
        }, (payload) => { 
            // Jika pesan untuk saya dan bukan dari chat aktif
            if (payload.new.receiver_id === myData.unique_id && 
                payload.new.sender_unique_id !== activeChat?.unique_id) {
                const senderId = payload.new.sender_unique_id;
                unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
                loadContacts();
            }
            
            // Jika pesan dalam chat aktif
            if ((payload.new.receiver_id === myData.unique_id && payload.new.sender_unique_id === activeChat?.unique_id) ||
                (payload.new.sender_unique_id === myData.unique_id && payload.new.receiver_id === activeChat?.unique_id)) {
                loadMessages();
                markAsRead();
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages_webchat'
        }, () => {
            loadMessages();
        })
        .subscribe();
    
    // Listen for new statuses
    sb.channel('status-updates')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'statuses'
        }, () => {
            loadStatuses();
        })
        .subscribe();
    
    // Setup presence for online status
    const presence = sb.channel('online-status');
    
    presence.on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState(); 
        onlineUsers = {};
        
        for (const id in state) { 
            if (state[id][0]?.uid) {
                onlineUsers[state[id][0].uid] = true; 
            }
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
    }).subscribe(async (status) => { 
        if (status === 'SUBSCRIBED') {
            await presence.track({ 
                uid: myData.unique_id,
                username: myData.username,
                online_at: new Date().toISOString()
            }); 
        }
    });

    // Typing indicator
    const msgInput = document.getElementById('msg-input');
    if (msgInput) {
        msgInput.oninput = () => {
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
}

// Open modal
window.openModal = function(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
};

// Close modal
window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    if (modalId === 'profile-modal') {
        tempAvatarBase64 = null;
    }
};

// Open my profile
window.openMyProfile = function() {
    document.getElementById('edit-bio').value = myData.bio || "";
    document.getElementById('edit-preview').src = myData.avatar_url || `https://ui-avatars.com/api/?name=${myData.username}`;
    openModal('profile-modal');
};

// Open target profile
window.openTargetProfile = function() {
    if(!activeChat) return;
    
    document.getElementById('v-avatar').src = activeChat.avatar_url || `https://ui-avatars.com/api/?name=${activeChat.username}`;
    document.getElementById('v-name').innerText = activeChat.username;
    document.getElementById('v-bio').innerText = activeChat.bio || "Tidak ada bio.";
    document.getElementById('v-id').innerText = "ID: " + activeChat.unique_id;
    openModal('view-profile-modal');
};

// Create status
window.createStatus = async function() {
    const statusText = document.getElementById('status-input').value.trim();
    if (!statusText) {
        alert("Status tidak boleh kosong!");
        return;
    }
    
    if (statusText.length > 500) {
        alert("Status terlalu panjang! Maksimal 500 karakter.");
        return;
    }
    
    const { error } = await sb.from('statuses').insert([{
        user_id: myData.unique_id,
        text: statusText,
        likes: 0
    }]);
    
    if (error) {
        alert("Gagal membuat status!");
        return;
    }
    
    document.getElementById('status-input').value = "";
    closeModal('status-modal');
    alert("Status berhasil diposting!");
};

// Send message on Enter key
document.addEventListener('DOMContentLoaded', function() {
    const msgInput = document.getElementById('msg-input');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => { 
            if(e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMsg(); 
            }
        });
    }
});

// Search contact by name or ID
window.searchContact = function() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const contactItems = document.querySelectorAll('.contact-item');
    
    if (!query) {
        contactItems.forEach(item => item.style.display = 'flex');
        return;
    }
    
    contactItems.forEach(item => {
        const nameElement = item.querySelector('div[style*="font-weight:900"]');
        const statusElement = item.querySelector('small');
        
        if (!nameElement || !statusElement) return;
        
        const name = nameElement.textContent.toLowerCase();
        const status = statusElement.textContent.toLowerCase();
        const shouldShow = name.includes(query) || status.includes(query);
        item.style.display = shouldShow ? 'flex' : 'none';
    });
};

// Add contact manually
window.addContactManual = async function() {
    const sid = document.getElementById('search-id').value.trim();
    if (!sid) {
        alert("Masukkan ID teman!");
        return;
    }
    
    if (sid === myData.unique_id) {
        alert("Tidak bisa menambahkan diri sendiri!");
        return;
    }
    
    const { data, error } = await sb.from('profiles_webchat')
        .select('*')
        .eq('unique_id', sid)
        .single();
    
    if (error || !data) {
        alert("ID tidak ditemukan!");
        return;
    }
    
    alert("Berhasil menemukan: " + data.username);
    document.getElementById('search-id').value = "";
    loadContacts();
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in (simple check)
    const savedUser = localStorage.getItem('orachat_user');
    if (savedUser) {
        try {
            myData = JSON.parse(savedUser);
            startApp();
        } catch (e) {
            localStorage.removeItem('orachat_user');
        }
    }
    
    // Save user data on login
    if (window.handleAuth) {
        const originalHandleAuth = window.handleAuth;
        window.handleAuth = async function() {
            await originalHandleAuth();
            if (myData) {
                localStorage.setItem('orachat_user', JSON.stringify(myData));
            }
        };
    }
});
