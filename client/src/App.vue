<template>
  <div id="app">
    <sidebar-nav :currentPage="currentPage" @page-change="changePage" />
    <div class="main-content">
      <CreateView v-if="currentPage === 'create'" />
      <SearchView v-else-if="currentPage === 'search'" />
      <UpdateView v-else-if="currentPage === 'update'" />
      <SettingsView v-else-if="currentPage === 'settings'" />
    </div>
  </div>
</template>

<script>
import SidebarNav from './components/SidebarNav.vue'  // Updated import
import CreateView from './views/CreateView.vue'
import SearchView from './views/SearchView.vue'
import UpdateView from './views/UpdateView.vue'
import SettingsView from './views/SettingsView.vue'

export default {
  name: 'App',
  components: {
    SidebarNav,  // Updated component registration
    CreateView,
    SearchView,
    UpdateView,
    SettingsView
  },
  data() {
    return {
      currentPage: 'create'
    }
  },
  methods: {
    changePage(page) {
      this.currentPage = page
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  margin-left: 200px; /* Matches sidebar width */
  padding: 20px;
  width: calc(100% - 200px); /* Ensure content doesn't overlap */
  box-sizing: border-box;
}
</style>
