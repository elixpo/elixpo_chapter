
import React from 'react'
import Layout from './layout'
import Navbar from './components_for_home/Navbar'
import Hero from './components_for_home/Hero'
import ComponentsShowCase from './components_for_home/components-showcase'
import Access from './components_for_home/Access'
import Testimonial from './components_for_home/Testimonial'
import Works from './components_for_home/Works'
import Links from './components_for_home/Links'
import FAQ from './components_for_home/FAQ'
import Contributer from './components_for_home/Contributer'
import Marquee from './components_for_home/Marquee'
import Impress from './components_for_home/Impress'
import Footer from './components_for_home/Footer'
import Line from './components_for_home/Line'


const page = () => {
  return (
  <Layout>
    <Navbar/>
    <Hero/>
    <ComponentsShowCase/> 
    <Access/>
    <Testimonial/>
    <Works/>
    <Links/>
    <Line/>
   
    <Contributer/>
    <Marquee/>
    <Impress/>
    <Footer/>
  </Layout>
  )
}

export default page