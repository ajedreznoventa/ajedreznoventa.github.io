<script setup lang="ts">
import VideoTable from './components/VideoTable.vue'
import {ref} from "vue";
import {Video} from "@/model/Video";
import {FiltersModifiedEvent} from "@/event/FiltersModifiedEvent";
import {VideoFilter} from "@/model/VideoFilter";
import VideosFiltersSelectors from "@/components/filters/VideosFiltersSelectors.vue";
import PageFooter from "@/components/PageFooter.vue";
import {useVideosStore} from "@/stores/videosStore";
import {useOpeningsStore} from "@/stores/openingsStore";
import {usePgnsStore} from "@/stores/pgnsStore";
import {usePositionsStore} from "@/stores/positionsStore";
import Toast from 'primevue/toast';
import {useToast} from 'primevue/usetoast';
import _ from "lodash";

const videosStore = useVideosStore()

const filteredVideos = ref<Array<Video>>([])
const filters = ref<Array<VideoFilter>>([])

const toast = useToast();

function filterVideos() {
  filteredVideos.value = videosStore
      .videos
      .filter(video => filters.value.every(videoFilter => videoFilter.test(video)))
}

const addModifyToast = _.throttle(() => toast.add({severity: 'success', summary: 'Filters modified', life: 3000}), 2000, { 'trailing': false })
const addRemovedToast = _.throttle(() => toast.add({severity: 'success', summary: 'Filter removed', life: 3000}), 100, { 'trailing': false })

function onFiltersModified(event: FiltersModifiedEvent) {
  if (event.filters.length < filters.value.length) {
    addRemovedToast()
  } else if (_.unionWith(filters.value, event.filters, (left, right) => left.equals(right)).length !== filters.value.length || filters.value.length !== event.filters.length) {
    addModifyToast()
  }

  filters.value.length = 0
  filters.value.push(...event.filters)

  filterVideos()
}

videosStore.fetchVideos()
    .then(() => {
      filterVideos()
    }).then(() => useOpeningsStore().fetchOpenings())
    .then(() => {
      usePgnsStore().fetchPgns()
      usePositionsStore().fetchPositions()
    })

</script>

<template>
  <div class="container my-4">
    <Toast/>

    <!-- Description Banner -->
    <div class="card mb-4 border-0 shadow-sm bg-light">
      <div class="card-body">
        <p class="card-text mb-0">
          Buenas, en esta pagina podreis encontrar todas las partidas del canal de youtube 
          <a href="https://www.youtube.com/@ajedreznoventa" target="_blank" class="fw-bold text-decoration-none">
            @ajedreznoventa
          </a>. 
          Podeis buscarlas por nombres de jugadores, o por posiciones. Saludos.
        </p>
      </div>
    </div>

    <VideosFiltersSelectors @filtersModified="onFiltersModified"></VideosFiltersSelectors>
    <VideoTable :videos="filteredVideos"></VideoTable>
    <PageFooter></PageFooter>
  </div>
</template>

<style scoped>

</style>
