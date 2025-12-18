export const AUTH_SECTION = `
    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 relative bg-yellow-100">
        <!-- Decoration blobbies -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div class="absolute top-10 left-10 text-9xl text-pink-300 opacity-50 rotate-12"><i class="fa-solid fa-cloud"></i></div>
            <div class="absolute bottom-10 right-10 text-9xl text-blue-300 opacity-50 -rotate-12"><i class="fa-solid fa-star"></i></div>
        </div>

        <div class="w-full max-w-sm fun-card p-8 relative z-10 bg-white">
            <div class="text-center mb-8">
                <div class="w-20 h-20 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4 text-black text-3xl shadow-[4px_4px_0px_#000]">
                    <i class="fa-solid fa-face-smile-wink"></i>
                </div>
                <h1 class="text-4xl font-heading font-black text-black tracking-tight mb-1">People OS</h1>
                <p class="text-slate-500 text-lg font-bold">Top Secret Stuff! 🤫</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Who are you?" class="fun-input w-full p-4 text-lg" required>
                <input v-model="auth.password" type="password" placeholder="Secret Password" class="fun-input w-full p-4 text-lg" required>
                <button type="submit" :disabled="loading" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-heading font-bold py-4 rounded-xl text-lg fun-btn flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Checking...' : 'Let Me In!' }}
                </button>
            </form>
        </div>
    </div>`;
