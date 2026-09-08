import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { isChatStart } from './useLayoutRouteWatch';

// The only durable fact about incognito is which screen you are on, so the
// one piece of real state is whether the new-chat top-bar toggle has armed
// it for the next message. Nothing else writes this.
const armed = ref(false);

/**
 * Shared incognito state, derived from the route.
 *
 * `/incognito` is an incognito session by definition; the chat-start screens
 * (`/` and `/new`) are incognito only while the top-bar toggle has armed it,
 * because that is where the user arms it before the first message navigates
 * to `/incognito`. Every other route — most importantly a stored conversation
 * — is never incognito, so opening one from the sidebar cannot leave a stale
 * flag behind that would suppress loading it.
 *
 * Must be called from a setup context (it uses `useRoute`).
 *
 * @returns {{ isIncognito: import('vue').ComputedRef<boolean>,
 *   isIncognitoSession: import('vue').ComputedRef<boolean>,
 *   toggleIncognito: () => void, setIncognito: (value: boolean) => void }}
 */
export function useGlobalIncognito() {
  const route = useRoute();

  const isIncognitoSession = computed(() => route.path === '/incognito');

  const isIncognito = computed(
    () => isIncognitoSession.value || (armed.value && isChatStart(route.path)),
  );

  return {
    isIncognito,
    isIncognitoSession,
    toggleIncognito: () => {
      armed.value = !armed.value;
    },
    setIncognito: (value) => {
      armed.value = value;
    },
  };
}
