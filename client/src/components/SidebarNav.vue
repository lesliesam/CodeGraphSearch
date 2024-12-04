<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Graph Search</h2>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-item" :class="{ active: currentPage === 'create' }" @click="$emit('page-change', 'create')">
        Create New
      </div>
      <div class="nav-item" :class="{ active: currentPage === 'search' }" @click="$emit('page-change', 'search')">
        Search
      </div>
      <div class="nav-item" :class="{ active: currentPage === 'update' }" @click="$emit('page-change', 'update')">
        Update Graph
      </div>
      <div class="nav-item" :class="{ active: currentPage === 'settings' }" @click="$emit('page-change', 'settings')">
        Settings
      </div>
    </nav>
  </div>
</template>

<script>
export default {
  name: 'SidebarNav',
  props: {
    currentPage: {
      type: String,
      required: true
    }
  }
}
</script>

<style scoped>
.sidebar {
  width: 200px;
  background-color: #2c3e50;
  color: white;
  padding: 20px 0;
  position: fixed;
  height: 100vh;
  left: 0;
  top: 0;
}

.sidebar-header {
  padding: 0 20px;
  margin-bottom: 20px;
}

.nav-item {
  padding: 15px 20px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.nav-item:hover {
  background-color: #34495e;
}

.nav-item.active {
  background-color: #3498db;
}
</style>
